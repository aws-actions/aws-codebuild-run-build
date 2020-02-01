// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const {
  logName,
  githubInputs,
  inputs2Parameters,
  waitForBuildEndTime
} = require("../code-build");
const { expect } = require("chai");

describe("logName", () => {
  it("return the logGroupName and logStreamName from an ARN", () => {
    const arn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";
    const test = logName(arn);
    expect(test)
      .to.haveOwnProperty("logGroupName")
      .and.to.equal("/aws/codebuild/CloudWatchLogGroup");
    expect(test)
      .to.haveOwnProperty("logStreamName")
      .and.to.equal("1234abcd-12ab-34cd-56ef-1234567890ab");
  });

  it("return undefined when the group and stream are null", () => {
    const arn =
      "arn:aws:logs:us-west-2:111122223333:log-group:null:log-stream:null";
    const test = logName(arn);
    expect(test)
      .to.haveOwnProperty("logGroupName")
      .and.to.equal(undefined);
    expect(test)
      .to.haveOwnProperty("logStreamName")
      .and.to.equal(undefined);
  });
});

describe("githubInputs", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  const projectName = "project_name";
  const repoInfo = "owner/repo";
  const sha = "1234abcd-12ab-34cd-56ef-1234567890ab";

  it("build basic parameters for codeBuild.startBuild", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;
    const test = githubInputs();
    expect(test)
      .to.haveOwnProperty("projectName")
      .and.to.equal(projectName);
    expect(test)
      .to.haveOwnProperty("sourceVersion")
      .and.to.equal(sha);
    expect(test)
      .to.haveOwnProperty("owner")
      .and.to.equal(`owner`);
    expect(test)
      .to.haveOwnProperty("repo")
      .and.to.equal(`repo`);
    expect(test)
      .to.haveOwnProperty("buildspecOverride")
      .and.to.equal(undefined);
    expect(test)
      .to.haveOwnProperty("envPassthrough")
      .and.to.deep.equal([]);
  });

  it("a project name is required.", () => {
    expect(() => githubInputs()).to.throw();
  });

  it("can process env-vars-for-codebuild", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;

    process.env[`INPUT_ENV-PASSTHROUGH`] = `one, two 
    , three,
    four    `;

    process.env.one = "_one_";
    process.env.two = "_two_";
    process.env.three = "_three_";
    process.env.four = "_four_";

    const test = githubInputs();

    expect(test)
      .to.haveOwnProperty("envPassthrough")
      .and.to.deep.equal(["one", "two", "three", "four"]);
  });
});

describe("inputs2Parameters", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  const projectName = "project_name";
  const repoInfo = "owner/repo";
  const sha = "1234abcd-12ab-34cd-56ef-1234567890ab";

  it("build basic parameters for codeBuild.startBuild", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;
    const test = inputs2Parameters({
      projectName,
      sourceVersion: sha,
      owner: "owner",
      repo: "repo"
    });
    expect(test)
      .to.haveOwnProperty("projectName")
      .and.to.equal(projectName);
    expect(test)
      .to.haveOwnProperty("sourceVersion")
      .and.to.equal(sha);
    expect(test)
      .to.haveOwnProperty("sourceTypeOverride")
      .and.to.equal("GITHUB");
    expect(test)
      .to.haveOwnProperty("sourceLocationOverride")
      .and.to.equal(`https://github.com/owner/repo.git`);
    expect(test)
      .to.haveOwnProperty("buildspecOverride")
      .and.to.equal(undefined);

    // I send everything that starts 'GITHUB_'
    expect(test)
      .to.haveOwnProperty("environmentVariablesOverride")
      .and.to.have.lengthOf.greaterThan(1);

    const [repoEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "GITHUB_REPOSITORY"
    );
    expect(repoEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("GITHUB_REPOSITORY");
    expect(repoEnv)
      .to.haveOwnProperty("value")
      .and.to.equal(repoInfo);
    expect(repoEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    const [shaEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "GITHUB_SHA"
    );
    expect(shaEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("GITHUB_SHA");
    expect(shaEnv)
      .to.haveOwnProperty("value")
      .and.to.equal(sha);
    expect(shaEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");
  });

  it("can process env-vars-for-codebuild", () => {
    // This is how GITHUB injects its input values.
    // It would be nice if there was an easy way to test this...
    process.env[`INPUT_PROJECT-NAME`] = projectName;
    process.env[`GITHUB_REPOSITORY`] = repoInfo;
    process.env[`GITHUB_SHA`] = sha;

    process.env[`INPUT_ENV-PASSTHROUGH`] = `one, two 
    , three,
    four    `;

    process.env.one = "_one_";
    process.env.two = "_two_";
    process.env.three = "_three_";
    process.env.four = "_four_";

    const test = inputs2Parameters({
      projectName,
      sourceVersion: sha,
      owner: "owner",
      repo: "repo",
      envPassthrough: ["one", "two", "three", "four"]
    });

    expect(test)
      .to.haveOwnProperty("environmentVariablesOverride")
      .and.to.have.lengthOf.greaterThan(5);

    const [oneEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "one"
    );
    expect(oneEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("one");
    expect(oneEnv)
      .to.haveOwnProperty("value")
      .and.to.equal("_one_");
    expect(oneEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    const [twoEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "two"
    );
    expect(twoEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("two");
    expect(twoEnv)
      .to.haveOwnProperty("value")
      .and.to.equal("_two_");
    expect(twoEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    const [threeEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "three"
    );
    expect(threeEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("three");
    expect(threeEnv)
      .to.haveOwnProperty("value")
      .and.to.equal("_three_");
    expect(threeEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");

    const [fourEnv] = test.environmentVariablesOverride.filter(
      ({ name }) => name === "four"
    );
    expect(fourEnv)
      .to.haveOwnProperty("name")
      .and.to.equal("four");
    expect(fourEnv)
      .to.haveOwnProperty("value")
      .and.to.equal("_four_");
    expect(fourEnv)
      .to.haveOwnProperty("type")
      .and.to.equal("PLAINTEXT");
  });
});

describe("waitForBuildEndTime", () => {
  it("basic usages", async () => {
    let count = 0;
    const buildID = "buildID";
    const cloudWatchLogsArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";

    const buildReplies = [
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      }
    ];
    const logReplies = [{ events: [] }];
    const sdk = help(
      () => buildReplies[count++],
      () => logReplies[count - 1]
    );

    const test = await waitForBuildEndTime(sdk, {
      id: buildID,
      logs: { cloudWatchLogsArn }
    });

    expect(test).to.equal(buildReplies.pop().builds[0]);
  });

  it("waits for a build endTime **and** no cloud watch log events", async function() {
    this.timeout(25000);
    let count = 0;
    const buildID = "buildID";
    const nullArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:null:log-stream:null";
    const cloudWatchLogsArn =
      "arn:aws:logs:us-west-2:111122223333:log-group:/aws/codebuild/CloudWatchLogGroup:log-stream:1234abcd-12ab-34cd-56ef-1234567890ab";

    const buildReplies = [
      { builds: [{ id: buildID, logs: { cloudWatchLogsArn } }] },
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      },
      {
        builds: [
          { id: buildID, logs: { cloudWatchLogsArn }, endTime: "endTime" }
        ]
      }
    ];
    const logReplies = [
      undefined,
      { events: [{ message: "got one" }] },
      { events: [] }
    ];
    const sdk = help(
      () => buildReplies[count++],
      () => logReplies[count - 1]
    );

    const test = await waitForBuildEndTime(sdk, {
      id: buildID,
      logs: { cloudWatchLogsArn: nullArn }
    });
    expect(test).to.equal(buildReplies.pop().builds[0]);
  });
});

function help(builds, logs) {
  const codeBuild = {
    batchGetBuilds() {
      return {
        async promise() {
          return ret(builds);
        }
      };
    }
  };

  const cloudWatchLogs = {
    getLogEvents() {
      return {
        async promise() {
          return ret(logs);
        }
      };
    }
  };

  return { codeBuild, cloudWatchLogs, wait: 10 };

  function ret(thing) {
    if (typeof thing === "function") return thing();
    return thing;
  }
}
