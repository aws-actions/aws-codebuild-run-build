// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const core = require("@actions/core");
const github = require("@actions/github");
const aws = require("aws-sdk");
const assert = require("assert");

module.exports = {
  runBuild,
  build,
  buildBatch,
  waitForBuildEndTime,
  waitForBatchBuildEndTime,
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
  const isBatch = core.getInput("batch").toUpper() === "TRUE";

  if (isBatch) {
    return buildBatch(sdk, params);
  } else {
    return build(sdk, params);
  }
}

async function build(sdk, params) {
  // Start the build
  const start = await sdk.codeBuild.startBuild(params).promise();

  // Wait for the build to "complete"
  return waitForBuildEndTime(sdk, start.build);
}

async function buildBatch(sdk, params) {
  // Start the batch
  const { buildBatch } = await sdk.codeBuild.startBuildBatch(params).promise();
  const { id } = buildBatch;

  // Wait for the batch to "complete"
  return waitForBatchBuildEndTime(sdk, { id });
}

async function waitForBatchBuildEndTime(sdk, { id, observedBuilds = [] }) {
  const { codeBuild, wait = 2000 } = sdk;

  /* Batch builds take a long time,
   * and there is a fare amount
   * of eventual constancy involved.
   * The first time I enter,
   * I never expect this wait
   * to impact performance.
   * But for every recursive call,
   * this wait makes a simple gate
   * to keep from throttling myself.
   */
  await new Promise((resolve) => setTimeout(resolve, wait));

  const { buildBatches } = await codeBuild
    .batchGetBuildBatches({ ids: [id] })
    .promise();
  const [current] = buildBatches;
  const { buildGroups } = current;

  /* Immediately after the batch is started,
   * the build group will be empty.
   * I have to wait for the first build,
   * that will process the list/matrix
   * that start all the builds
   * that do the work.
   */
  if (!buildGroups) return waitForBatchBuildEndTime(sdk, { id });

  // The build ids I have not yet waited for.
  const ids = buildGroups
    .map(({ currentBuildSummary }) => currentBuildSummary.arn)
    .filter((arn) => !observedBuilds.includes(arn));

  /* Don't try and get the status of 0 builds.
   * It would be nice to not have an if here,
   * but it is nicer to not make the remote call.
   */
  if (ids.length) {
    // Get the information for the builds to wait for
    const { builds } = await codeBuild.batchGetBuilds({ ids }).promise();

    for (const build of builds) {
      console.log(`=========== START: ${build.id} =============`);
      await waitForBuildEndTime(sdk, build)
        /* Just because this build failed,
         * I still need to stream the other results.
         * waitForBuildEndTime is supposed to handle
         * all retirable errors.
         * It may be better to
         * gather up these errors
         * and throw when the batch has completed.
         */
        .catch((e) => {
          console.log(`Error in build ${build.id}: ${e.stack} `);
        });
      console.log(`============================================`);
    }

    /* Update the observed builds
     * since they have now been observed.
     * The `currentBuildSummary` does not have the id.
     * It only has the arn,
     * so while the id is nice to pass around,
     * the arn is what I want to keep here.
     * Otherwise each build will need to be streamed twice.
     */
    observedBuilds = observedBuilds.concat(builds.map(({ arn }) => arn));
  }

  /* Just because I have processed
   * all the builds in the buildGroup
   * this does not mean
   * that the batch is complete.
   * This is especially true with the first build.
   * The first build in the batch generally
   * is how all the needed builds are calculated.
   * So the first time I'm here,
   * I expect to have 1 build.
   * After that first build,
   * I expect to recurse
   * and then have the complete set.
   * But why not just recurse until
   * the batch is no longer in progress?
   */
  if (current.buildBatchStatus === "IN_PROGRESS")
    return waitForBatchBuildEndTime(sdk, {
      id,
      observedBuilds,
    });

  /* If the batch is not IN_PROGRESS
   * this is as good as it gets.
   */
  return current;
}

async function waitForBuildEndTime(sdk, { id, logs }, nextToken) {
  const {
    codeBuild,
    cloudWatchLogs,
    wait = 1000 * 30,
    backOff = 1000 * 15,
  } = sdk;

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
        .getLogEvents({ logGroupName, logStreamName, startFromHead, nextToken })
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

      //Sleep before trying again
      await new Promise((resolve) => setTimeout(resolve, newWait));

      // Try again from the same token position
      return waitForBuildEndTime(
        { ...sdk, wait: newWait },
        { id, logs },
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

  // stdout the CloudWatchLog (everyone likes progress...)
  // CloudWatchLogs have line endings.
  // I trim and then log each line
  // to ensure that the line ending is OS specific.
  events.forEach(({ message }) => console.log(message.trimEnd()));

  // We did it! We can stop looking!
  if (current.endTime && !events.length) return current;

  // More to do: Sleep for a few seconds to avoid rate limiting
  await new Promise((resolve) => setTimeout(resolve, wait));

  // Try again
  return waitForBuildEndTime(sdk, current, nextForwardToken);
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
