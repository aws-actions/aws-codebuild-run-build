// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

module.exports = function () {
  return {
    files: ["./code-build.js"],
    tests: ["test/code-build-test.js"],
    testFramework: "mocha",
    env: { type: "node" },
    debug: true,
  };
};
