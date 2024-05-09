// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const core = require("@actions/core");
const github = require("@actions/github");
const { CloudWatchLogs } = require("@aws-sdk/client-cloudwatch-logs");
const { CodeBuild } = require("@aws-sdk/client-codebuild");
const assert = require("assert");

module.exports = {
  runBuild,
  build,
  waitForBuildEndTime,
  inputs2Parameters,
  githubInputs,
  buildSdk,
  logName,
};

function runBuild() {
  // get a codeBuild instance from the SDK
  const sdk = buildSdk();

  const inputs = githubInputs();

  const config = (({
    updateInterval,
    updateBackOff,
    hideCloudWatchLogs,
    stopOnSignals,
  }) => ({
    updateInterval,
    updateBackOff,
    hideCloudWatchLogs,
    stopOnSignals,
  }))(inputs);

  // Get input options for startBuild
  const params = inputs2Parameters(inputs);

  return build(sdk, params, config);
}

async function build(sdk, params, config) {
  // Start the build
  const start = await sdk.codeBuild.startBuild(params);

  // Set up signal handling to stop the build on cancellation
  setupSignalHandlers(sdk, start.build.id, config.stopOnSignals);

  // Wait for the build to "complete"
  return waitForBuildEndTime(sdk, start.build, config);
}

function setupSignalHandlers(sdk, id, signals) {
  signals.forEach((s) => {
    core.info(`Installing signal handler for ${s}`);
    process.on(s, async () => {
      try {
        core.info(`Caught ${s}, attempting to stop build...`);
        await sdk.codeBuild.stopBuild({ id });
      } catch (ex) {
        core.error(`Error stopping build: ${ex}`);
      }
    });
  });
}

async function waitForBuildEndTime(
  sdk,
  { id, logs },
  { updateInterval, updateBackOff, hideCloudWatchLogs },
  seqEmptyLogs,
  totalEvents,
  throttleCount,
  nextToken
) {
  const { codeBuild, cloudWatchLogs } = sdk;

  totalEvents = totalEvents || 0;
  seqEmptyLogs = seqEmptyLogs || 0;
  throttleCount = throttleCount || 0;

  // Get the CloudWatchLog info
  const startFromHead = true;
  const { cloudWatchLogsArn } = logs;
  const { logGroupName, logStreamName } = logName(cloudWatchLogsArn);

  let errObject = false;
  // Check the state
  const [batch, cloudWatch = {}] = await Promise.all([
    codeBuild.batchGetBuilds({ ids: [id] }),
    !hideCloudWatchLogs &&
      logGroupName &&
      cloudWatchLogs // only make the call if hideCloudWatchLogs is not enabled and a logGroupName exists
        .getLogEvents({
          logGroupName,
          logStreamName,
          startFromHead,
          nextToken,
        }),
  ]).catch((err) => {
    errObject = err;
    /* Returning [] here so that the assignment above
     * does not throw `TypeError: undefined is not iterable`.
     * The error is handled below,
     * since it might be a rate limit.
     */
    return [];
  });

  if (errObject) {
    //We caught an error in trying to make the AWS api call, and are now checking to see if it was just a rate limiting error
    if (errObject.message && errObject.message.search("Rate exceeded") !== -1) {
      // We were rate-limited, so add backoff with Full Jitter, ref: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
      let jitteredBackOff = Math.floor(
        Math.random() * (updateBackOff * 2 ** throttleCount)
      );
      let newWait = updateInterval + jitteredBackOff;
      throttleCount++;

      //Sleep before trying again
      await new Promise((resolve) => setTimeout(resolve, newWait));

      // Try again from the same token position
      return waitForBuildEndTime(
        { ...sdk },
        { id, logs },
        { updateInterval: newWait, updateBackOff },
        seqEmptyLogs,
        totalEvents,
        throttleCount,
        nextToken
      );
    } else {
      //The error returned from the API wasn't about rate limiting, so throw it as an actual error and fail the job
      throw errObject;
    }
  }

  // Pluck off the relevant state
  const [current] = batch.builds;
  const { nextForwardToken, events = [] } = cloudWatch;

  // GetLogEvents can return partial/empty responses even when there is data.
  // We wait for two consecutive empty log responses to minimize false positive on EOF.
  // Empty response counter starts after any logs have been received, or when the build completes.
  if (events.length == 0 && (totalEvents > 0 || current.endTime)) {
    seqEmptyLogs++;
  } else {
    seqEmptyLogs = 0;
  }
  totalEvents += events.length;

  // stdout the CloudWatchLog (everyone likes progress...)
  // CloudWatchLogs have line endings.
  // I trim and then log each line
  // to ensure that the line ending is OS specific.
  events.forEach(({ message }) => console.log(message.trimEnd()));

  // Stop after the build is ended and we've received two consecutive empty log responses
  if (current.endTime && seqEmptyLogs >= 2) {
    return current;
  }

  // More to do: Sleep for a few seconds to avoid rate limiting
  // If never throttled and build is complete, halve CWL polling delay to minimize latency
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      current.endTime && throttleCount == 0
        ? updateInterval / 2
        : updateInterval
    )
  );

  // Try again
  return waitForBuildEndTime(
    sdk,
    current,
    { updateInterval, updateBackOff, hideCloudWatchLogs },
    seqEmptyLogs,
    totalEvents,
    throttleCount,
    nextForwardToken
  );
}

function githubInputs() {
  const projectName = core.getInput("project-name", { required: true });
  const disableSourceOverride =
    core.getInput("disable-source-override", { required: false }) === "true";
  const { owner, repo } = github.context.repo;
  const { payload } = github.context;
  // The github.context.sha is evaluated on import.
  // This makes it hard to test.
  // So I use the raw ENV.
  // There is a complexity here because for pull request
  // the GITHUB_SHA value is NOT the correct value.
  // See: https://github.com/aws-actions/aws-codebuild-run-build/issues/36
  const sourceVersion =
    core.getInput("source-version-override", { required: false }) || 
    (process.env[`GITHUB_EVENT_NAME`] === "pull_request"
      ? (((payload || {}).pull_request || {}).head || {}).sha
      : process.env[`GITHUB_SHA`]);

  assert(sourceVersion, "No source version could be evaluated.");

  const sourceTypeOverride = 
    core.getInput("source-type-override", { required: false, }) || undefined;

  const sourceLocationOverride =
    core.getInput("source-location-override", { required: false }) || undefined;

  const buildspecOverride =
    core.getInput("buildspec-override", { required: false }) || undefined;

  const computeTypeOverride =
    core.getInput("compute-type-override", { required: false }) || undefined;

  const environmentTypeOverride =
    core.getInput("environment-type-override", { required: false }) ||
    undefined;

  const imageOverride =
    core.getInput("image-override", { required: false }) || undefined;

  const imagePullCredentialsTypeOverride =
    core.getInput("image-pull-credentials-type-override", {
      required: false,
    }) || undefined;

  const envPassthrough = core
    .getInput("env-vars-for-codebuild", { required: false })
    .split(",")
    .map((i) => i.trim())
    .filter((i) => i !== "");

  const updateInterval =
    parseInt(
      core.getInput("update-interval", { required: false }) || "30",
      10
    ) * 1000;
  const updateBackOff =
    parseInt(
      core.getInput("update-back-off", { required: false }) || "15",
      10
    ) * 1000;

  const hideCloudWatchLogs =
    core.getInput("hide-cloudwatch-logs", { required: false }) === "true";

  const disableGithubEnvVars =
    core.getInput("disable-github-env-vars", { required: false }) === "true";

  const artifactsTypeOverride =
    core.getInput("artifacts-type-override", { required: false }) || undefined;

  const stopOnSignals = core
    .getInput("stop-on-signals", { required: false })
    .split(",")
    .map((i) => i.trim())
    .filter((i) => i !== "");

  return {
    projectName,
    owner,
    repo,
    sourceVersion,
    buildspecOverride,
    computeTypeOverride,
    environmentTypeOverride,
    imageOverride,
    imagePullCredentialsTypeOverride,
    envPassthrough,
    updateInterval,
    updateBackOff,
    disableSourceOverride,
    hideCloudWatchLogs,
    disableGithubEnvVars,
    artifactsTypeOverride,
    stopOnSignals,
  };
}

function inputs2Parameters(inputs) {
  const {
    projectName,
    owner,
    repo,
    sourceVersion,
    sourceTypeOverride,
    sourceLocationOverride,
    buildspecOverride,
    computeTypeOverride,
    environmentTypeOverride,
    imageOverride,
    imagePullCredentialsTypeOverride,
    envPassthrough = [],
    disableSourceOverride,
    disableGithubEnvVars,
    artifactsTypeOverride,
  } = inputs;

  const sourceOverride = !disableSourceOverride
    ? {
        sourceVersion: sourceVersion,
        sourceTypeOverride: sourceTypeOverride || "GITHUB",
        sourceLocationOverride: sourceLocationOverride || `https://github.com/${owner}/${repo}.git`,
      }
    : {};

  const artifactsOverride = artifactsTypeOverride
    ? {
        artifactsOverride: {
          type: artifactsTypeOverride,
        },
      }
    : {};

  const environmentVariablesOverride = Object.entries(process.env)
    .filter(
      ([key]) =>
        (!disableGithubEnvVars && key.startsWith("GITHUB_")) ||
        envPassthrough.includes(key)
    )
    .map(([name, value]) => ({ name, value, type: "PLAINTEXT" }));

  // The idempotencyToken is intentionally not set.
  // This way the GitHub events can manage the builds.
  return {
    projectName,
    ...sourceOverride,
    buildspecOverride,
    ...artifactsOverride,
    computeTypeOverride,
    environmentTypeOverride,
    imageOverride,
    imagePullCredentialsTypeOverride,
    environmentVariablesOverride,
  };
}

function buildSdk() {
  const codeBuild = new CodeBuild({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  const cloudWatchLogs = new CloudWatchLogs({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  // check if environment variable exists for the container credential provider
  if (
    !process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI &&
    !process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  ) {
    assert(
      codeBuild.config.credentials && cloudWatchLogs.config.credentials,
      "No credentials. Try adding @aws-actions/configure-aws-credentials earlier in your job to set up AWS credentials."
    );
  }

  return { codeBuild, cloudWatchLogs };
}

function logName(Arn) {
  const logs = {
    logGroupName: undefined,
    logStreamName: undefined,
  };
  if (Arn) {
    const [logGroupName, logStreamName] = Arn.split(":log-group:")
      .pop()
      .split(":log-stream:");
    if (logGroupName !== "null" && logStreamName !== "null") {
      logs.logGroupName = logGroupName;
      logs.logStreamName = logStreamName;
    }
  }
  return logs;
}
