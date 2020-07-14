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
  // Invoke the lambda to start the build
  const lambdaParams = {
    FunctionName: "easy_generalized_deploy"
    Payload: {
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      sourceVerion: params.sourceVersion
    }
  }

  const start = await sdk.lambda.invoke(lambdaParams).promise();

  // Wait for the build to "complete"
  return waitForBuildEndTime(sdk, start.build);
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
  const { owner, repo, branch } = github.context.repo;
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

  return {
    owner,
    repo,
    branch,
    sourceVersion,
  };
}

function inputs2Parameters(inputs) {
  const {
    owner,
    repo,
    branch,
    sourceVersion,
  } = inputs;

  // The idempotencyToken is intentionally not set.
  // This way the GitHub events can manage the builds.
  return {
    owner,
    repo,
    branch,
    sourceVersion
  };
}

function buildSdk() {
  const codeBuild = new aws.CodeBuild({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  const cloudWatchLogs = new aws.CloudWatchLogs({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  });

  const lambda == new aws.Lambda({
    customUserAgent: "aws-actions/aws-codebuild-run-build",
  })

  assert(
    codeBuild.config.credentials && cloudWatchLogs.config.credentials,
    "No credentials. Try adding @aws-actions/configure-aws-credentials earlier in your job to set up AWS credentials."
  );

  return { codeBuild, cloudWatchLogs, lambda };
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
