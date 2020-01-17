## "AWS CodeBuild Run Project" Action For GitHub Actions

For a CodeBuild project `startBuild` from GitHub Actions.
Forward the CloudWatch log to GitHub.
Wait for completion and error on anything but a `SUCCEEDED` build.

The started build will have all the `GITHUB_` [environment variables](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables).
In addition a comma separated list of configured environment variables.

Regardless of the project configuration in CodeBuild,
the `sourceVersion`, `sourceTypeOverride`, `sourceLocationOverride` options are set as follows:

| CodeBuild value | GitHub value |
| ------------- |-------------|
| `sourceVersion` | The environment variable: `GITHUB_SHA` |
| `sourceTypeOverride` | The string `'GITHUB'` |
| `sourceLocationOverride` | The `HTTPS` git url for `context.repo`|

## Usage

A very simple example:

```yaml
    - name: Start CodeBuild
      uses: aws-actions/aws-codebuild-run-project@v1
      with:
        project-name: CodeBuildProjectName
```

A more complicated example

```yaml
    - name: Start CodeBuild
      uses: aws-actions/aws-codebuild-run-project@v1
      with:
        project-name: CodeBuildProjectName
        buildspec-override: path/to/buildspec.yaml
        env-passthrough: |
          additional,
          variables,
          define,
          code
      env:
        additional: environment
        variables: to
        define: in
        code: build
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## Implementation notes on intention

GitHub actions help configure source management with events.
However, there are a few limitations.
The intention of this action is to give you the power of GitHub Actions,
and the flexibility of AWS CodeBuild.

* Size

Available resources are limited to 2 cores 7 GB RAM.
For extremely large builds massive parallelization can return results faster.
CodeBuild can offer up to 72 vCPUs and 144GB RAM.
* Architecture

CodeBuild supports ARM and GPU containers.
* Security

There may be assets, configuration, or access that is not accessible from GitHub.

This action does not wrap every option of CodeBuild::StartBuild.
This is intentional.
To implement every CodeBuild option,
would require a way to configure each option.
This would increase the cognitive load to use the action.
In a standard case would create a lot of boilerplate configuration.
In a complicated case getting the values to pass to the action
seems complicated if we are to handle every eventuality.

With this in mind,
we chose to focus on starting a build
with configured similarly to `actions/checkout@v2`.
Monitoring this build's CloudWatchLog and reporting progress as it happens,
and when the build completes succeeding or failing based on the build's status.

## License

This SDK is distributed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0),
see LICENSE.txt and NOTICE.txt for more information.
