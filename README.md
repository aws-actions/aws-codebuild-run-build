## AWS CodeBuild Run Build for GitHub Actions

This action runs a [AWS CodeBuild][codebuild] [project][codebuild project]
as a step in a GitHub Actions workflow job.

The action builds the CodeBuild project, collects the build logs, and prints them as they are written.
The user experience is the same as it would be if the logic were executed
in the GitHub Actions job runner.

[Security issue notifications](./CONTRIBUTING.md#security-issue-notifications)

**Related feature**: [Self-Hosted Runner in CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/action-runner.html) allows GitHub Actions to integrate natively with AWS and access all compute platforms that CodeBuild offers, including Lambda, GPU-enhanced and Arm-based instances.

## Usage

### Inputs

This action offers following inputs that you can use to configure its behavior.
The only required input is `project-name`.

1. **project-name** (required) : The name of CodeBuild project you want to run.
1. **buildspec-override** (optional) :
   The location (in this repository) of the [buildspec file][codebuild buildspec]
   that CodeBuild requires.
   By default, the action uses the buildspec file location
   that you configured in the CodeBuild project.

   Alternatively, you can pass in an inline buildspec definition like so:

   ```
   - name: Run CodeBuild
     uses: aws-actions/aws-codebuild-run-build@v1
     with:
       project-name: my-codebuild-job
       disable-source-override: true
       buildspec-override:   |
         version: 0.2
         phases:
           install:
             runtime-versions:
               nodejs: 16
             commands:
               - npm install -g typescript
               - npm install
           pre_build:
             commands:
               - echo Installing source NPM dependencies...
           build:
             commands:
               - echo Build started on `date`
               - tsc
               - npm prune --production
             post_build:
               commands:
                 - echo Build completed on `date`
         artifacts:
           type: zip
           files:
             - package.json
             - package-lock.json
   ```

1. **compute-type-override** (optional) :
   The name of a compute type for this build that overrides the one specified
   in the build project.
1. **environment-type-override** (optional) :
   A container type for this build that overrides the one specified in the
   build project.
1. **image-override** (optional) :
   The name of an image for this build that overrides the one specified
   in the build project.
1. **image-pull-credentials-type-override** (optional) :
   The type of credentials CodeBuild uses to pull images in your build.
1. **disable-source-override** (optional) :
   Set to `true` if you want to disable providing `sourceVersion`,
   `sourceTypeOverride` and `sourceLocationOverride` to CodeBuild.
1. **source-version-override** (optional) :
   The source version that overrides the `sourceVersion` provided to Codebuild.
1. **source-type-override** (optional) :
   The source type that overrides the `sourceTypeOverride` provided to Codebuild.
1. **source-location-override** (optional) :
    The source location that overrides the `sourceLocationOverride` provided to Codebuild.
1. **env-vars-for-codebuild** (optional) :
   A comma-separated list of the names of environment variables
   that the action passes from GitHub Actions to CodeBuild.

   The action passes these environment variables to CodeBuild
   along with any environment variables that have a `github` prefix.

   This list is often the same or a subset of the list of environment variables
   that you define for GitHub actions in the `env` property.

   Note: If you specify an environment variable
   with the same name as one defined in your CodeBuild project,
   the one defined here replaces the one in the CodeBuild project.
   For a list of CodeBuild environment variables, see

1. **update-interval** (optional) :
   Update interval as seconds for how often the API is called to check on the status.

   A higher value mitigates the chance of hitting API rate-limiting especially when
   running many instances of this action in parallel, but also introduces a larger
   potential time overhead (ranging from 0 to update interval) for the action to
   fetch the build result and finish.

   Lower value limits the potential time overhead worst case but it may hit the API
   rate-limit more often, depending on the use-case.

   The default value is 30.

1. **update-back-off** (optional) :
   Base back-off time in seconds for the update interval.

   When API rate-limiting is hit the back-off time, augmented with jitter, will be
   added to the next update interval.
   E.g. with update interval of 30 and back-off time of 15, upon hitting the rate-limit
   the next interval for the update call will be 30 + random*between(0, 15 * 2 \*\* 0))
   seconds and if the rate-limit is hit again the next interval will be
   30 + random*between(0, 15 * 2 \*\* 1) and so on.

   The default value is 15.

1. **hide-cloudwatch-logs** (optional) :
   Set to `true` if you do not want CloudWatch Logs to be streamed to GitHub Action.

1. **disable-github-env-vars** (optional) :
   Set to `true` if you want do disable github environment variables in codebuild.

1. **stop-on-signals** (optional) :
   Comma-separated list of signals that will cause any started builds to be
   stopped. The default value is `SIGINT`, which is what GitHub sends processes
   when a workflow is cancelled. This means you can use concurrency settings or
   other GitHub features that cause workflow cancellations without leaving
   orphan builds running. Set to an empty string to disable.

1. **artifacts-type-override** (optional) :
   If required, you can override the default behavior of CodeBuild artifacts. This feature is particularly useful for triggering CodeBuild projects configured within CodePipeline. You can set the artifacts to `NO_ARTIFACTS` in such cases

### Outputs

1. **aws-build-id** : The CodeBuild build ID of the build that the action ran.

## Purpose

This action is designed to give you the power of GitHub Actions
with options available in [AWS CodeBuild][codebuild] for more CPU and memory,
and access to other resources.

GitHub Actions provides a powerful system of event-based workflows,
but the hosted job runners cannot exceed the defined computing and memory limits,
and might prevent you from accessing resources that you need for your project.

[AWS CodeBuild][codebuild] is a fully managed continuous integration service
that can compile source code, run tests, and produce software packages that are ready to deploy.
It supports more environment options than standard GitHub Actions,
including a selection of powerful computing environments with additional memory.

### Resources and Architecture

[GitHub Actions job runners][github actions job runners] have 2 x86_64 CPU cores and 7 GB RAM.

This is enough for the most common activities,
but some large or complex builds need more resources,
and some builds need access to special CPU architectures or hardware.

[CodeBuild compute types][codebuild compute types] offer options including:

- up to 72 x86_64 vCPUs
- up to 255 GB RAM
- up to 8 ARM64 vCPUs
- GPU hardware devices

### Access

Your workflow might require access to assets, configuration, or resources
that are impossible, difficult, or simply expensive
to access from GitHub's hosted job runners
but are easy or cheap to access from CodeBuild.

## Credentials and Permissions

In order for the action to run your CodeBuild project,
you need to provide AWS credentials.
We recommend using [aws-actions/configure-aws-credentials]
to configure your credentials for a job.

**NOTE:
GitHub Secrets are not passed to the runner when a workflow is triggered from a forked repository.
This means that you cannot use this action directly in a workflow
that is triggered by pull requests from a fork.
See the [GitHub Secrets docs][github secrets access] for more information.**

The credentials that you provide need to have the following permissions:

- `codebuild:StartBuild`
- `codebuild:BatchGetBuilds`
- `logs:GetLogEvents`

For example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
      "Resource": ["arn:aws:codebuild:REGION:ACCOUNT_ID:project/PROJECT_NAME"]
    },
    {
      "Effect": "Allow",
      "Action": ["logs:GetLogEvents"],
      "Resource": [
        "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/codebuild/PROJECT_NAME:*"
      ]
    }
  ]
}
```

## Examples

These examples show how you can define a step in a workflow job.
For more information about GitHub Actions workflow syntax,
see the [GitHub docs][github workflow syntax].

If your CodeBuild project is already configured the way you want it,
the only CodeBuild Run input you need to provide is the project name.

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-2
- name: Run CodeBuild
  uses: aws-actions/aws-codebuild-run-build@v1
  with:
    project-name: CodeBuildProjectName
```

If you reuse a project in multiple jobs or repositories,
you might want to provide a bit more configuration.
For example, the following configuration
specifies an alternate location for the buildspec file.
It also tells AWS CodeBuild Run Build
to send all of the environment variables defined in the `env:` list to CodeBuild.
If any of these environment variables are defined in the CodeBuild project,
this will overwrite them.

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-2
- name: Run CodeBuild
  uses: aws-actions/aws-codebuild-run-build@v1
  with:
    project-name: CodeBuildProjectName
    buildspec-override: path/to/buildspec.yaml or inline buildspec definition
    compute-type-override: compute-type
    environment-type-override: environment-type
    image-override: ecr-image-uri
    env-vars-for-codebuild: |
      custom,
      requester,
      event-name
  env:
    custom: my environment variable
    requester: ${{ github.actor }}
    event-name: ${{ github.event_name }}
```

### Running Locally

It can be useful to run a build outside of CI.
So, this action can also be installed locally
to kick off a CodeBuild project from your git sandbox.
You could push your changes to an open PR,
but if you only want to test one project this may be faster.
In order to use this tool,
you must first `git checkout` the commit that you want to test.

```
npx @aws-actions/codebuild-run-build -p ProjectName -r remoteName
```

This will use whatever commit you have checked out
and push to a temporary branch in the specified remote.
Then kick off the build
and delete the remote branch when complete.

You can also install the project globally or locally
and execute it that way.

## Implementation Notes

### What we did

We call the [CodeBuild `StartBuild` API][codebuild startbuild],
checking out the commit that triggered the workflow.

The action waits for the build to complete while logging everything written to the build's
[Amazon CloudWatch Logs][cloudwatch logs] [logstream][cloudwatch logs concepts].
If the `buildStatus` value in the StartBuild response is `SUCCEEDED`, the action succeeds.
Otherwise, it fails.

In the call to StartBuild, we pass in all
`GITHUB_` [environment variables][github environment variables] in the GitHub Actions environment,
plus any environment variables that you specified in the `env-vars-for-codebuild` input value.

By default, regardless of the project configuration in CodeBuild or GitHub Actions,
we always pass the following parameters and values to CodeBuild in the StartBuild API call.

| CodeBuild value          | GitHub value                           |
| ------------------------ | -------------------------------------- |
| `sourceVersion`          | The commit that triggered the workflow |
| `sourceTypeOverride`     | The string `'GITHUB'`                  |
| `sourceLocationOverride` | The `HTTPS` git url for `context.repo` |

If you want to disable sending the parameters `sourceVersion`, `sourceTypeOverride` and `sourceLocationOverride` you can use `disable-source-override` input.

### What we did not do

This action intentionally does not let you specify every option
in the [CodeBuild::StartBuild][codebuild startbuild] API.

Because all GitHub Actions input values are passed through environment variables,
they must be simple strings.
This makes it difficult to pass complex structures as inputs.

Also, providing an input for every parameter in the `StartBuild` API
would have made it much more difficult to use and maintain this tool.
We would have to add many more inputs or require string values,
while hoping that all supported configurations
conformed to the environment variable length limits.

For this reason, and to simplify what we expect to be the most common use-cases,
we chose to start with the simplest possible configuration.
If you find that these options don't meet your needs, please open an issue to let us know.

## Release Process

By creating a new Release a workflow is triggered creating a new commit which only contains `dist` and the `action.yml`. The necessary tags, i.e. for the release v1.0.7, the tag v1.0.7 is created and the v1.0 and v1 tags are updated.

For the tagging and building the [build-and-tag](https://github.com/JasonEtco/build-and-tag-action) action by [Jason Etcovitch](https://github.com/JasonEtco) is used. It expects to have the main attribute and a build script to be set in the `package.json`. It then builds the code with the ncc compiler and creates the new tag/ updates existing tags for minor and major versions automatically.

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
[github workflow syntax]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/workflow-syntax-for-github-actions
[github secrets access]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets#using-encrypted-secrets-in-a-workflow
[aws-actions/configure-aws-credentials]: https://github.com/aws-actions/configure-aws-credentials
