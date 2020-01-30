#!/usr/bin/env node
// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const uuid = require("uuid/v4");
const cp = require("child_process");
const cb = require("./code-build");
const assert = require("assert");
const yargs = require("yargs");

const { projectName, buildspecOverride, envPassthrough, remote } = yargs
  .option("project-name", {
    alias: "p",
    describe: "AWS CodeBuild Project Name",
    demandOption: true,
    type: "string"
  })
  .option("buildspec-override", {
    alias: "b",
    describe: "Path to buildspec file",
    type: "string"
  })
  .option("env-passthrough", {
    alias: "e",
    describe: "List of environment variables to send to CodeBuild",
    type: "array"
  })
  .option("remote", {
    alias: "r",
    describe: "remote name to publish to",
    default: "origin",
    type: "string"
  }).argv;

const BRANCH_NAME = uuid();

const params = cb.inputs2Parameters({
  projectName,
  ...githubInfo(remote),
  sourceVersion: cp.execSync(`git rev-parse HEAD`).toString(),
  buildspecOverride,
  envPassthrough
});

const sdk = cb.buildSdk();

pushBranch(remote, BRANCH_NAME);

cb.build(sdk, params)
  .then(() => deleteBranch(remote, BRANCH_NAME))
  .catch(() => deleteBranch(remote, BRANCH_NAME));

function pushBranch(remote, branchName) {
  cp.execSync(`git push ${remote} HEAD:${branchName}`);
}

function deleteBranch(remote, branchName) {
  cp.execSync(`git push ${remote} :${branchName}`);
}

function githubInfo(remote) {
  const gitHubSSH = "git@github.com:";
  const gitRemote = cp.execSync(`git remote -v | grep ${remote}`).toString();
  assert(gitRemote, `No remote found named ${remote}`);
  const [, url] = gitRemote.split(/[\t ]/);
  assert(url.startsWith(gitHubSSH), `Unsupported format: ${url}`);
  const [owner, repo] = url.slice(gitHubSSH.length, -4).split("/");
  return { owner, repo };
}
