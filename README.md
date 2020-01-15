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
        buildspec-override: path/to/buildSpec.yaml
        env-vars: additional, variables, define, code
      env:
        additional: environment
        variables: to
        define: in
        code: build
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## License

This SDK is distributed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0),
see LICENSE.txt and NOTICE.txt for more information.
