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
  logName
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

  // Wait for the build to "complete"
  return waitForBuildEndTime(sdk, start.build);
}

async function waitForBuildEndTime(sdk, { id, logs }, nextToken) {
  const { codeBuild, cloudWatchLogs, wait = 1000 * 5 } = sdk;

  // Get the CloudWatchLog info
  const startFromHead = true;
  const { cloudWatchLogsArn } = logs;
  const { logGroupName, logStreamName } = logName(cloudWatchLogsArn);

  // Check the state
  const [batch, cloudWatch = {}] = await Promise.all([
    codeBuild.batchGetBuilds({ ids: [id] }).promise(),
    // The CloudWatchLog _may_ not be set up, only make the call if we have a logGroupName
    logGroupName &&
      cloudWatchLogs
        .getLogEvents({ logGroupName, logStreamName, startFromHead, nextToken })
        .promise()
  ]);
  // Pluck off the relevant state
  const [current] = batch.builds;
  const { nextForwardToken, events = [] } = cloudWatch;

  // stdout the CloudWatchLog (everyone likes progress...)
  events.forEach(({ message }) => console.log(message));

  // We did it! We can stop looking!
  if (current.endTime && !events.length) return current;

  // More to do: Sleep for 5 seconds :)
  await new Promise(resolve => setTimeout(resolve, wait));

  // Try again
  return waitForBuildEndTime(sdk, current, nextForwardToken);
}

function githubInputs() {
  const projectName = core.getInput("project-name", { required: true });
  const { owner, repo } = github.context.repo;
  // The github.context.sha is evaluated on import.
  // This makes it hard to test.
  // So I use the raw ENV
  const sourceVersion = process.env[`GITHUB_SHA`];
  const buildspecOverride =
    core.getInput("buildspec-override", { required: false }) || undefined;

  const envPassthrough = core
    .getInput("env-passthrough", { required: false })
    .split(",")
    .map(i => i.trim())
    .filter(i => i !== "");

  return {
    projectName,
    owner,
    repo,
    sourceVersion,
    buildspecOverride,
    envPassthrough
  };
}

function inputs2Parameters(inputs) {
  const {
    projectName,
    owner,
    repo,
    sourceVersion,
    buildspecOverride,
    envPassthrough = []
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
    environmentVariablesOverride
  };
}

function buildSdk() {
  const codeBuild = new aws.CodeBuild({
    customUserAgent: "aws-codbuild-run-project"
  });

  const cloudWatchLogs = new aws.CloudWatchLogs({
    customUserAgent: "aws-codbuild-run-project"
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
      logStreamName: undefined
    };
  return { logGroupName, logStreamName };
}
