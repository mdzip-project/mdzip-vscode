# MDZip Template System Plan

## Goal

Let users create new `.mdz` documents from reusable templates while keeping the feature broad enough for many document types.

The motivating workflow is agile story writing in VS Code: a user should be able to right-click a folder, choose `MDZip: New From Template...`, pick an agile story template, and get a new MDZip file with sections for Description, Acceptance Criteria, and Plan. Other users should be able to add templates for meeting notes, bug reports, design docs, runbooks, research notes, or any other repeated document shape.

## Product Shape

The core feature should be templates, not only agile stories.

Suggested commands:

```text
MDZip: New From Template...
```

`MDZip: New From Template...` is the only creation command. Specific workflows such as agile stories should be represented as templates in the picker, not as separate commands.

Suggested menu placements:

1. Explorer context menu on folders.
2. Explorer context menu near `.mdz` and `.md` files.
3. Command Palette.

When invoked on a folder, create the new document in that folder. When invoked on a file, default to the file's parent folder. When invoked from the Command Palette without a URI, prompt for a target folder or fall back to the workspace root when there is only one workspace folder.

## Template Types

Support three template shapes:

1. Template folders: a directory with template files and an optional `template.config.json`.
2. Markdown templates (`.md`): simple text templates that become a new single-document `.mdz`.
3. MDZip templates (`.mdz`): full archive templates that can include images, manifest metadata, and supporting files.

Folder templates should be the primary user template model. This follows the shape of `kylemwhite/Template-Generator-kmw`: each template is a recognizable folder name, the folder can contain arbitrary files/subdirectories, and an optional `template.config.json` can define prompted parameters and files to open after generation.

For MDZip, a folder template can contain:

1. A source Markdown file that becomes the primary entry.
2. Images or supporting files that are packaged into the generated `.mdz`.
3. An optional `manifest.json`.
4. An optional `template.config.json`.

Markdown templates are the easiest path for quick personal templates. MDZip templates preserve the full value of the format when the template needs packaged assets or a non-trivial manifest.

## Built-In Templates

Ship a small set of built-in templates:

```text
Blank Document
Agile Story
```

Suggested agile story template:

```md
# {title}

## Description

As a ...
I want ...
So that ...

## Acceptance Criteria

- [ ] Given ...
  When ...
  Then ...

## Plan

-
```

Keep built-in templates intentionally plain. They should provide useful structure without imposing a process-heavy workflow.

## User Templates

Add a setting for user template folders:

```json
"mdzip.templates.path": "",
"mdzip.templates.additionalPaths": []
```

This mirrors the referenced Template Generator extension while using an MDZip-specific setting namespace.

`mdzip.templates.path` is the primary template folder. `mdzip.templates.additionalPaths` allows multiple extra folders, which is useful for combining global personal templates with workspace-specific templates.

Relative paths beginning with `./` or `../` should resolve from the first workspace folder. This supports per-project templates configured through workspace `.vscode/settings.json`.

Each configured folder can contain template folders plus standalone `.md` and `.mdz` templates. Template display names should come from the template folder or file name first, with later support for manifest metadata, front matter, or `template.config.json`.

Discovery rules:

1. Built-in templates always appear.
2. User templates are appended after built-ins.
3. Duplicate display names should be disambiguated with the parent folder name.
4. Invalid or unreadable templates should be skipped and reported through a quiet warning or output channel entry.

## Template Variables

Support simple placeholder replacement in file contents and generated paths. Follow the referenced extension's approachable placeholder style:

```text
{title}
{filename}
{date}
{datetime}
```

Start with built-in variables:

1. `title`: prompted document title.
2. `filename`: filesystem-safe slug derived from the title unless overridden.
3. `date`: local date.
4. `datetime`: local datetime.

Allow template-specific parameters through `template.config.json`:

```json
{
  "parameters": [
    {
      "name": "Story ID",
      "variable": "story_id",
      "description": "Ticket or work item identifier",
      "pattern": "[A-Za-z]+-[0-9]+"
    }
  ],
  "openAfterGeneration": [
    "{filename}.mdz"
  ]
}
```

Parameter behavior:

1. Prompt for each configured parameter.
2. Use `description` as the input prompt or placeholder text.
3. Treat `pattern` as optional validation.
4. Replace `{variable}` in file contents, archive paths, generated filenames, manifest fields, and `openAfterGeneration` paths.

Avoid adding advanced expression syntax in the first version. If users need more control later, add a constrained variable resolver rather than arbitrary script execution.

## Creation Flow

Suggested flow for `MDZip: New From Template...`:

1. Resolve the target folder from the invocation context.
2. Discover built-in and user templates.
3. Show a quick pick with template names.
4. Prompt for document title and any template-specific parameters.
5. Suggest a filename such as `<slug>.mdz`.
6. Prevent accidental overwrite unless the user explicitly confirms.
7. Create the new `.mdz`.
8. Open generated files listed in `openAfterGeneration`; otherwise open the new `.mdz` in the MDZip custom editor.

## Repository Ownership

The VS Code UX belongs in `mdzip-vscode`:

1. Commands and menus in `package.json`.
2. Quick pick and input flows in `src/extension.ts` or a focused template module.
3. Workspace folder and URI handling.
4. Opening the new document in the custom editor.

Reusable archive/template construction should live in `@mdzip/editor` if it grows beyond simple command glue:

1. Build a `.mdz` from Markdown template text.
2. Clone an `.mdz` template while applying variable substitutions.
3. Preserve or update manifest metadata.
4. Validate template output.

For an initial implementation, `mdzip-vscode` can call existing `@mdzip/editor` archive helpers. If template handling becomes shared with a browser app, CLI, or MCP workflow, promote the logic into `mdzip-editor`.

## Phase 1: Built-In Templates and Single Command

Implement the smallest useful workflow.

Implementation steps:

1. Add `MDZip: New From Template...`.
2. Add built-in `Blank Document` and `Agile Story` templates.
3. Add Explorer folder context menu support.
4. Prompt for title and filename.
5. Build a new `.mdz` from the selected built-in Markdown template.
6. Open the created file in the custom editor.

Validation:

1. Create from a workspace folder.
2. Create from a file context and confirm the parent folder is used.
3. Confirm overwrite protection.
4. Confirm the new document opens in preview mode.

## Phase 2: Folder-Based User Templates

Add the reusable user-facing template system modeled after Template Generator.

Implementation steps:

1. Add `mdzip.templates.path` and `mdzip.templates.additionalPaths`.
2. Resolve absolute and workspace-relative template paths.
3. Discover template folders plus standalone `.md` and `.mdz` templates.
4. Read optional `template.config.json` from template folders.
5. Prompt for configured parameters with optional regex validation.
6. Apply placeholders to file contents, archive paths, generated filenames, manifest fields, and `openAfterGeneration`.
7. Package folder templates into a `.mdz`.
8. Clone MDZip templates and apply placeholders to text entries and manifest fields.

Validation:

1. Confirm built-in templates appear with no settings.
2. Confirm templates from multiple folders appear.
3. Confirm duplicate names are readable in the picker.
4. Confirm invalid templates do not block valid templates.

## Phase 3: Template Metadata

Add optional metadata for richer template discovery.

Possible sources:

1. `template.config.json` fields in folder templates.
2. `manifest.json` fields in `.mdz` templates.
3. YAML front matter in `.md` templates.
4. Sidecar metadata files only if the previous options are insufficient.

Potential metadata:

```json
{
  "title": "Agile Story",
  "description": "Story with Description, Acceptance Criteria, and Plan sections",
  "suggestedFileName": "{title}.mdz",
  "tags": ["agile", "planning"]
}
```

Keep metadata optional. A plain `.md` file should remain a valid template.

## Phase 4: Template Authoring Helpers

Add affordances that help users create and manage their own templates.

Possible commands:

```text
MDZip: Save Current Document as Template...
MDZip: Open Templates Folder
MDZip: Configure Template Folders
```

These are convenience commands and should not be required for the core flow.

## Open Questions

1. Should there be a default user template folder, or should templates only appear after `mdzip.templates.path` is configured?
2. Should folder templates support multiple Markdown files as a project-style `.mdz`, or should v1 require one primary Markdown file?
3. Should placeholders apply to every text file inside an `.mdz` template or only Markdown entries and manifest fields?
4. Should `template.config.json` support default values for parameters?
5. Should created documents use `.mdz` only, or should the flow also support creating plain `.md` files?

## Notes

Do not introduce executable templates in the initial design. Templates should be data files with constrained variable substitution so they are predictable, portable, and safe to share.
