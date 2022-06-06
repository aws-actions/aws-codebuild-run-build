// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const core = require("@actions/core");
const github = require("@actions/github");
const aws = require("aws-sdk");
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

  // Get input options for startBuild
  const params = inputs2Parameters(githubInputs());

  return build(sdk, params);
}

async function build(sdk, params) {
  // Start the build
  const start = await sdk.codeBuild.startBuild(params).promise();
  return start.build
}

async function waitForBuildEndTime(
  sdk,
  { id, logs },
  seqEmptyLogs,
  totalEvents,
  throttleCount,
  nextToken
) {
  const {
    codeBuild,
    cloudWatchLogs,
    wait = 1000 * 30,
    backOff = 1000 * 15,
  } = sdk;

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
    codeBuild.batchGetBuilds({ ids: [id] }).promise(),
    // The CloudWatchLog _may_ not be set up, only make the call if we have a logGroupName
    logGroupName &&
      cloudWatchLogs
        .getLogEvents({
          logGroupName,
          logStreamName,
          startFromHead,
          nextToken,
        })
        .promise(),
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
      //We were rate-limited, so add `backOff` seconds to the wait time
      let newWait = wait + backOff;
      throttleCount++;

      //Sleep before trying again
      await new Promise((resolve) => setTimeout(resolve, newWait));

      // Try again from the same token position
      return waitForBuildEndTime(
        { ...sdk, wait: newWait },
        { id, logs },
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
    setTimeout(resolve, current.endTime && throttleCount == 0 ? wait / 2 : wait)
  );

  // Try again
  return waitForBuildEndTime(
    sdk,
    current,
    seqEmptyLogs,
    totalEvents,
    throttleCount,
    nextForwardToken
  );
}

function githubInputs() {
  const projectName = core.getInput("project-name", { required: true });
  const { owner, repo } = github.context.repo;
  const { payload } = github.context;
  // The github.context.sha is evaluated on import.
  // This makes it hard to test.
  // So I use the raw ENV.
  // There is a complexity here because for pull request
  // the GITHUB_SHA value is NOT the correct value.
  // See: https://github.com/aws-actions/aws-codebuild-run-build/issues/36
  const sourceVersion =
    process.env[`GITHUB_EVENT_NAME`] === "pull_request"
      ? (((payload || {}).pull_request || {}).head || {}).sha
      : process.env[`GITHUB_SHA`];

  assert(sourceVersion, "No source version could be evaluated.");
  const buildspecOverride =
    core.getInput("buildspec-override", { required: false }) || undefined;

  const envPassthrough = core
    .getInput("env-vars-for-codebuild", { required: false })
    .split(",")
    .map((i) => i.trim())
    .filter((i) => i !== "");

  return {
    projectName,
    owner,
    repo,
    sourceVersion,
    buildspecOverride,
    envPassthrough,
  };
}

function inputs2Parameters(inputs) {
  const {
    projectName,
    owner,
    repo,
    sourceVersion,
    buildspecOverride,
    envPassthrough = [],
  } = inputs;

  const sourceTypeOverride = "GITHUB";
  const sourceLocationOverride = `https://github.com/${owner}/${repo}.git`;

  const environmentVariablesOverride = Object.entries(process.env)
    .filter(
      ([key]) => key.startsWith("GITHUB_") || envPassthrough.includes(key)
    )
    .map(([name, value]) => ({ name, value, type: "PLAINTEXT" }));

  // The idempotencyToken is intentionally not set.
  // This way the GitHub events can manage the builds.
  return {
    projectName,
    sourceVersion,
    sourceTypeOverride,
    sourceLocationOverride,
    buildspecOverride,
    environmentVariablesOverride,
  };
}

function buildSdk() {
  const codeBuild = new aws.CodeBuild({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  const cloudWatchLogs = new aws.CloudWatchLogs({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  assert(
    codeBuild.config.credentials && cloudWatchLogs.config.credentials,
    "No credentials. Try adding @aws-actions/configure-aws-credentials earlier in your job to set up AWS credentials."
  );

  return { codeBuild, cloudWatchLogs };
}

function logName(Arn) {
  const [logGroupName, logStreamName] = Arn.split(":log-group:")
    .pop()
    .split(":log-stream:");
  if (logGroupName === "null" || logStreamName === "null")
    return {
      logGroupName: undefined,
      logStreamName: undefined,
    };
  return { logGroupName, logStreamName };
}
