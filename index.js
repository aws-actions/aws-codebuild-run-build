// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import { runBuild } from "./code-build.js";
import assert from "node:assert";

run();

export default run;

async function run() {
  console.log("*****STARTING CODEBUILD*****");
  try {
    const build = await runBuild();
    core.setOutput("aws-build-id", build.id);

    // Signal the outcome
    assert(
      build.buildStatus === "SUCCEEDED",
      `Build status: ${build.buildStatus}`,
    );
  } catch (error) {
    core.setFailed(error.message);
  } finally {
    console.log("*****CODEBUILD COMPLETE*****");
  }
}
