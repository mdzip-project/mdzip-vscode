# What to do when a user pastes an image into an .md file

## What others do:
1. No choice, copy image to file next to .md and link to it.
2. Choices:
  - Do #1 above
  - Offer to create subfolder (images, assets, custom)
  - Use system-wide media folder (configurable)
  - Ask user for a folder

## What the extension does now
Offers to convert to .mdz or cancel.... not much of a choice.

## What should it do?
Ideally, the editor would be configurable to give the user a set of choices including:
1. copy image to file next to .md
2. put in subfolder (configurable)
3. put in system media folder (configurable)
4. Provide a button to browse for a folder
5. convert to .mdz file and put in file

## Where should that code live?
- In the @mdzip/editor library?
- In each application?

Some things are kind of standard like saving the file next to the .md file IF we're saving on a file system. This wouldn't apply to a web-only application.

Some things would be very application specific, like saving to a configured media folder.

