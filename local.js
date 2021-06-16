#!/usr/bin/env node
// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const uuid = require("uuid/v4");
const cp = require("child_process");
const cb = require("./code-build");
const assert = require("assert");
const yargs = require("yargs");

const {
  projectName,
  sourceVersionOverride,
  buildspecOverride,
  envPassthrough,
  remote,
} = yargs
  .option("project-name", {
    alias: "p",
    describe: "AWS CodeBuild Project Name",
    demandOption: true,
    type: "string",
  })
  .option("buildspec-override", {
    alias: "b",
    describe: "Path to buildspec file",
    type: "string",
  })
  .option("source-version-override", {
    alias: "s",
    describe: "Source version, branch, commit",
    type: "string",
  })
  .option("env-vars-for-codebuild", {
    alias: "e",
    describe: "List of environment variables to send to CodeBuild",
    type: "array",
  })
  .option("remote", {
    alias: "r",
    describe: "remote name to publish to",
    default: "origin",
    type: "string",
  }).argv;

const BRANCH_NAME = sourceVersionOverride || uuid();

const params = cb.inputs2Parameters({
  projectName,
  ...githubInfo(remote),
  sourceVersion: BRANCH_NAME,
  buildspecOverride,
  envPassthrough,
});

const sdk = cb.buildSdk();

pushBranch(remote, BRANCH_NAME);

cb.build(sdk, params)
  .then(() => deleteBranch(remote, BRANCH_NAME))
  .catch((err) => {
    deleteBranch(remote, BRANCH_NAME);
    throw err;
  });

function pushBranch(remote, branchName) {
  cp.execSync(`git push ${remote} HEAD:${branchName}`);
}

function deleteBranch(remote, branchName) {
  cp.execSync(`git push ${remote} :${branchName}`);
}

function githubInfo(remote) {
  const gitHubSSH = "git@github.com:";
  const gitHubHTTPS = "https://github.com/";
  /* Expecting to match something like:
   * 'fork    git@github.com:seebees/aws-codebuild-run-build.git (push)'
   * Which is the output of `git remote -v`
   */
  const remoteMatch = new RegExp(`^${remote}.*\\(push\\)$`);
  /* Not doing a grep because then I have to pass user input to the shell.
   * This way I don't have to worry about sanitizing and injection and all that jazz.
   * Further, when I _do_ pass the remote into the shell to push to it,
   * given that I find it in the remote list,
   * I feel confident that there are no shinanaigans.
   */
  const [gitRemote] = cp
    .execSync("git remote -v")
    .toString()
    .split("\n")
    .filter((line) => line.trim().match(remoteMatch));
  assert(gitRemote, `No remote found named ${remote}`);
  const [, url] = gitRemote.split(/[\t ]/);
  if (url.startsWith(gitHubHTTPS)) {
    const [owner, repo] = url.slice(gitHubHTTPS.length, -4).split("/");
    return { owner, repo };
  } else if (url.startsWith(gitHubSSH)) {
    const [owner, repo] = url.slice(gitHubSSH.length, -4).split("/");
    return { owner, repo };
  } else {
    throw new Error(`Unsupported format: ${url}`);
  }
}
