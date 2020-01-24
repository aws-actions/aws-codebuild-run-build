## "AWS CodeBuild Run Build" Action For GitHub Actions

CodeBuild is a fully managed build service.
Building a project from GitHub Actions should be easy.
Adding this action to your workflow will run a build in CodeBuild
and report the results as if it ran in GitHub Actions.

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

## Intention and implementation notes

GitHub Actions help configure source management with events.
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

To accomplish this goal
we chose to focus on running a build for a single repository.
The CodeBuild `startBuild` is called,
checking out the commit that triggered the workflow.
The action waits for the build to complete
while logging everything written to the build's CloudWatch Logs logstream.
This action will succeed on a build status of `SUCCEEDED`
and fail for everything else.

When we start the build,
we pass through all `GITHUB_` [environment variables][github environment variables] present in the Action environment.
You can also use the `evn-passthrough` input value
to specify a comma-separated list of the names of additional environment variables
that you want to pass through.

Regardless of the project configuration in CodeBuild,
the `sourceVersion`, `sourceTypeOverride`, `sourceLocationOverride` options are set as follows:

| CodeBuild value | GitHub value |
| ------------- |-------------|
| `sourceVersion` | The commit that triggered the workflow |
| `sourceTypeOverride` | The string `'GITHUB'` |
| `sourceLocationOverride` | The `HTTPS` git url for `context.repo`|

This action does not wrap every option of [CodeBuild::StartBuild][codebuild-startbuild].
This is intentional.
To implement every CodeBuild option,
we would have to provide a way to configure every option.
The more complex configuration would make using the action more work for you.
This would required a lot of boilerplate configuration for standard cases
and would be a complex maintenance burden to support all complex cases
because of the limitations of GitHub Actions input values.
Since all inputs for GitHub Actions are flat environment variables,
we did not want to force people to hand write JSON in order to configure the action.
If you find that the options we provide do not meet your needs, let us know with an issue.

## License

This SDK is distributed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0),
see LICENSE and NOTICE for more information.

[github environment variables]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables
[codebuild-startbuild]: https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuild.html
