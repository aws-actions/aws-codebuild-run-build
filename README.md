## AWS CodeBuild Run Build for GitHub Actions

This action enables you to run an [AWS CodeBuild][codebuild] [project][codebuild project]
as a step in a GitHub Actions workflow job.

We build the project, collect the logs from that build, and print them as they are written.
The user experience is the same as it would be if the logic were executed in the GitHub Actions job runner.

## Usage

### Inputs

This action offers three inputs that you can use to configure its behavior:

1. **project-name** (required) : The CodeBuild project that you want to run.
1. **buildspec-override** (optional) :
    The location, in this repository, of a [buildspec file][codebuild buildspec] to require CodeBuild to use.
    The default behavior is to use the buidspec file location that you configured in the CodeBuild project.
1. **env-passthrough** (optional) :
    A comma-separated list of environment variables to pass through
    from the GitHub Actions environment to the CodeBuild execution environment.

## Purpose

GitHub Actions provides a powerful system of event-based workflows
but the hosted job runners do have some restrictions
that might limit how you can use GitHub Actions for your project.

[AWS CodeBuild][codebuild] is an execution platform in the AWS cloud
that can give you much more flexibility in where your logic executes.

The goal of this action is to give you the power of GitHub Actions
with the flexibility of AWS CodeBuild.

### Resources and Architecture

[GitHub Actions job runners][github actions job runners] have 2 x86_64 CPU cores and 7 GB RAM.

This is plenty for a lot of common activities
but some large or complex builds need more resources,
and some builds need access to special CPU architectures or hardware.

[CodeBuild compute types][codebuild compute types] offer options with up to
72 x86_64 vCPUs,
255 GB RAM,
8 ARM64 vCPUs,
or GPU hardware devices.

### Access

Your workflow might require access to assets, configuration, or resources
that are impossible, difficult, or simply expensive
to access from GitHub's hosted job runners
but are easy or cheap to access from CodeBuild.

### Examples

If your CodeBuild project has everything already configured how you want it,
all you need to do is provide the project name.

```yaml
    - name: Start CodeBuild
      uses: aws-actions/aws-codebuild-run-project@v1
      with:
        project-name: CodeBuildProjectName
```

You might want to reuse a project across multiple jobs or repositories.
In that case, you probably want to provide a bit more configuration.

```yaml
    - name: Start CodeBuild
      uses: aws-actions/aws-codebuild-run-project@v1
      with:
        project-name: CodeBuildProjectName
        buildspec-override: path/to/buildspec.yaml
        env-passthrough: |
          custom,
          requester,
          event-name
      env:
        custom: my environment variable
        requester: ${{ github.actor }}
        event-name: ${{ github.event_name }}
```

## Implementation Notes

### What we did

We call the CodeBuild `startBuild` API,
checking out the commit that triggered the workflow.
The action waits for the build to complete
while logging everything written to the build's
[Amazon CloudWatch Logs][cloudwatch logs] [logstream][cloudwatch logs concepts].
The action will then succeed on a build status of `SUCCEEDED`
and fail for everything else.

When we start the build,
we pass through all `GITHUB_` [environment variables][github environment variables] present in the Action environment.
You can also use the `evn-passthrough` input value
to specify a comma-separated list of the names of additional environment variables
that you want to pass through.

Regardless of the project configuration in CodeBuild,
the `sourceVersion`, `sourceTypeOverride`, and `sourceLocationOverride` options are set as follows:

| CodeBuild value          | GitHub value                           |
|--------------------------|----------------------------------------|
| `sourceVersion`          | The commit that triggered the workflow |
| `sourceTypeOverride`     | The string `'GITHUB'`                  |
| `sourceLocationOverride` | The `HTTPS` git url for `context.repo` |

### What we did not do

This action intentionally does not wrap every option of [CodeBuild::StartBuild][codebuild startbuild].

Because all GitHub Actions input values are passed through environment variables,
they must be simple strings.
This makes it difficult to pass complex structures through these inputs.
Providing inputs for all possible parameters in the `StartBuild` API
would have required adding significant complexity
either through adding many more inputs
or through requiring that all values be passed in a stringified form
and hoping that all reasonable configurations fit within
the limits of environment variable length.

For this reason, and to simplify what we expect to be the most common use-cases,
we chose to start with the simplest possible configuration that we could come up with.

If you find that the options we provide do not meet your needs, let us know with an issue.

## License

This SDK is distributed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0),
see LICENSE and NOTICE for more information.

[codebuild]: https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html
[codebuild project]: https://docs.aws.amazon.com/codebuild/latest/userguide/working-with-build-projects.html
[codebuild startbuild]: https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuild.html
[codebuild compute types]: https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-compute-types.html
[codebuild buildspec]: https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html
[cloudwatch logs]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html
[cloudwatch logs concepts]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html

[github environment variables]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables
[github actions job runners]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/virtual-environments-for-github-hosted-runners#supported-runners-and-hardware-resources
