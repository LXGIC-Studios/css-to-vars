# @lxgicstudios/css-to-vars

[![npm version](https://img.shields.io/npm/v/@lxgicstudios/css-to-vars)](https://www.npmjs.com/package/@lxgicstudios/css-to-vars)
[![license](https://img.shields.io/npm/l/@lxgicstudios/css-to-vars)](https://github.com/lxgicstudios/css-to-vars/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@lxgicstudios/css-to-vars)](https://nodejs.org)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/@lxgicstudios/css-to-vars)

Scan CSS files, find repeated hardcoded values (colors, spacing, fonts), and refactor them into CSS custom properties. Zero dependencies.

## Install

```bash
# Run directly
npx @lxgicstudios/css-to-vars ./src

# Or install globally
npm i -g @lxgicstudios/css-to-vars
```

## Usage

```bash
# Scan current directory for repeated CSS values
css-to-vars ./styles

# Preview changes without modifying files
css-to-vars --dry-run ./src/css

# Only extract colors used 3+ times
css-to-vars --min 3 --scope colors ./styles

# Custom variable prefix
css-to-vars --prefix theme --dry-run .

# JSON output for tooling
css-to-vars --json ./src
```

## Features

- **Scans recursively** for all `.css` files in a directory
- **Detects repeated values** including hex colors, rgb/rgba, hsl/hsla, named colors, spacing units, and font families
- **Generates `:root` block** with organized CSS custom properties
- **Replaces hardcoded values** with `var()` references
- **Dry run mode** to preview changes before applying
- **Configurable minimum** occurrence threshold
- **Scope filtering** to target colors, spacing, or all values
- **Custom prefix** for variable naming (default: `cv`)
- **JSON output** for integration with build tools
- **Zero external dependencies**

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview changes without writing files | `false` |
| `--min <n>` | Only extract values used n+ times | `2` |
| `--scope <type>` | What to extract: `colors`, `spacing`, or `all` | `all` |
| `--prefix <str>` | Prefix for generated variable names | `cv` |
| `--json` | Output results as JSON | `false` |
| `--help` | Show help message | - |

## Example Output

```
 css-to-vars v1.0.0

Scanning 12 CSS file(s)...

Found 8 repeated values:

  🎨 --cv-color-1: #3b82f6 (5 occurrences)
     src/header.css:12 (background-color)
     src/button.css:8 (color)
     src/links.css:3 (color)

  📐 --cv-spacing-16px: 16px (4 occurrences)
     src/layout.css:15 (padding)
     src/card.css:22 (margin)

Generated :root block:

:root {
  /* Colors */
  --cv-color-1: #3b82f6;
  /* Spacing */
  --cv-spacing-16px: 16px;
}
```

## License

MIT - [LXGIC Studios](https://lxgicstudios.com)
