#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

// ── ANSI Colors ──
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
};

const VERSION = "1.0.0";
const TOOL_NAME = "css-to-vars";

// ── Regex patterns ──
const COLOR_HEX = /#(?:[0-9a-fA-F]{3,8})\b/g;
const COLOR_RGB = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
const COLOR_HSL = /hsla?\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+\s*)?\)/g;
const COLOR_NAMED = /\b(red|blue|green|orange|purple|pink|brown|gray|grey|black|white|yellow|cyan|magenta|navy|teal|olive|maroon|aqua|lime|silver|fuchsia)\b/gi;
const SPACING = /(?<!\w)(\d+(?:\.\d+)?)(px|rem|em|vh|vw|%)\b/g;
const FONT_FAMILY = /font-family\s*:\s*([^;]+)/g;

interface ExtractedValue {
  value: string;
  type: "color" | "spacing" | "font";
  locations: Array<{ file: string; line: number; property: string }>;
}

interface CliOptions {
  paths: string[];
  dryRun: boolean;
  min: number;
  scope: "colors" | "spacing" | "all";
  prefix: string;
  json: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
${c.bgBlue}${c.white}${c.bold} ${TOOL_NAME} v${VERSION} ${c.reset}

${c.cyan}Scan CSS files, find repeated hardcoded values, and refactor them
into CSS custom properties automatically.${c.reset}

${c.bold}USAGE${c.reset}
  ${c.green}npx @lxgicstudios/${TOOL_NAME}${c.reset} [options] <files or directories...>

${c.bold}OPTIONS${c.reset}
  ${c.yellow}--dry-run${c.reset}          Preview changes without writing files
  ${c.yellow}--min <n>${c.reset}          Only extract values used n+ times (default: 2)
  ${c.yellow}--scope <type>${c.reset}     What to extract: colors, spacing, or all (default: all)
  ${c.yellow}--prefix <str>${c.reset}     Prefix for variable names (default: "cv")
  ${c.yellow}--json${c.reset}             Output results as JSON
  ${c.yellow}--help${c.reset}             Show this help message

${c.bold}EXAMPLES${c.reset}
  ${c.dim}# Scan current directory${c.reset}
  ${c.green}npx @lxgicstudios/${TOOL_NAME}${c.reset} ./src

  ${c.dim}# Dry run, only colors used 3+ times${c.reset}
  ${c.green}npx @lxgicstudios/${TOOL_NAME}${c.reset} --dry-run --min 3 --scope colors ./styles

  ${c.dim}# Custom prefix${c.reset}
  ${c.green}npx @lxgicstudios/${TOOL_NAME}${c.reset} --prefix theme ./css
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    paths: [],
    dryRun: false,
    min: 2,
    scope: "all",
    prefix: "cv",
    json: false,
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--min":
        opts.min = parseInt(argv[++i] || "2", 10);
        break;
      case "--scope":
        opts.scope = (argv[++i] || "all") as "colors" | "spacing" | "all";
        break;
      case "--prefix":
        opts.prefix = argv[++i] || "cv";
        break;
      default:
        if (!arg.startsWith("-")) {
          opts.paths.push(arg);
        }
        break;
    }
    i++;
  }

  if (opts.paths.length === 0) {
    opts.paths.push(".");
  }

  return opts;
}

function findCssFiles(dir: string): string[] {
  const results: string[] = [];
  const stat = fs.statSync(dir);

  if (stat.isFile() && dir.endsWith(".css")) {
    return [dir];
  }

  if (!stat.isDirectory()) return results;

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const entryStat = fs.statSync(full);
    if (entryStat.isDirectory()) {
      results.push(...findCssFiles(full));
    } else if (entry.endsWith(".css")) {
      results.push(full);
    }
  }

  return results;
}

function extractValues(
  content: string,
  filePath: string,
  scope: string
): Map<string, ExtractedValue> {
  const values = new Map<string, ExtractedValue>();
  const lines = content.split("\n");

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Skip lines that are already custom properties or comments
    if (line.trim().startsWith("--") || line.trim().startsWith("/*") || line.trim().startsWith("*") || line.trim().startsWith("//")) continue;
    // Skip var() references
    if (/var\(/.test(line)) continue;

    const propertyMatch = line.match(/^\s*([\w-]+)\s*:/);
    const property = propertyMatch ? propertyMatch[1]! : "unknown";

    if (scope === "colors" || scope === "all") {
      // Hex colors
      let match: RegExpExecArray | null;
      const hexRegex = new RegExp(COLOR_HEX.source, "g");
      while ((match = hexRegex.exec(line)) !== null) {
        const val = match[0].toLowerCase();
        addValue(values, val, "color", filePath, lineNum + 1, property);
      }

      // RGB colors
      const rgbRegex = new RegExp(COLOR_RGB.source, "g");
      while ((match = rgbRegex.exec(line)) !== null) {
        const val = match[0].replace(/\s+/g, " ");
        addValue(values, val, "color", filePath, lineNum + 1, property);
      }

      // HSL colors
      const hslRegex = new RegExp(COLOR_HSL.source, "g");
      while ((match = hslRegex.exec(line)) !== null) {
        const val = match[0].replace(/\s+/g, " ");
        addValue(values, val, "color", filePath, lineNum + 1, property);
      }

      // Named colors (only in color-related properties)
      if (/color|background|border|shadow|outline/i.test(property)) {
        const namedRegex = new RegExp(COLOR_NAMED.source, "gi");
        while ((match = namedRegex.exec(line)) !== null) {
          const val = match[0].toLowerCase();
          addValue(values, val, "color", filePath, lineNum + 1, property);
        }
      }
    }

    if (scope === "spacing" || scope === "all") {
      const spacingRegex = new RegExp(SPACING.source, "g");
      let match: RegExpExecArray | null;
      while ((match = spacingRegex.exec(line)) !== null) {
        // Skip 0px, 1px, 100%, very common values
        const num = parseFloat(match[1]!);
        const unit = match[2]!;
        if (num === 0 || (unit === "%" && (num === 100 || num === 50))) continue;
        if (unit === "px" && num === 1) continue;
        const val = `${match[1]}${unit}`;
        if (/margin|padding|gap|width|height|top|left|right|bottom|border-radius|font-size/i.test(property)) {
          addValue(values, val, "spacing", filePath, lineNum + 1, property);
        }
      }
    }

    if (scope === "all") {
      const fontRegex = new RegExp(FONT_FAMILY.source, "g");
      let match: RegExpExecArray | null;
      while ((match = fontRegex.exec(line)) !== null) {
        const val = match[1]!.trim();
        if (val.length > 2) {
          addValue(values, val, "font", filePath, lineNum + 1, property);
        }
      }
    }
  }

  return values;
}

function addValue(
  map: Map<string, ExtractedValue>,
  value: string,
  type: ExtractedValue["type"],
  file: string,
  line: number,
  property: string
): void {
  const existing = map.get(value);
  if (existing) {
    existing.locations.push({ file, line, property });
  } else {
    map.set(value, {
      value,
      type,
      locations: [{ file, line, property }],
    });
  }
}

function generateVarName(prefix: string, type: string, value: string, index: number): string {
  let name = `--${prefix}-${type}`;

  if (type === "color") {
    // Try to create a meaningful name from the value
    const hex = value.toLowerCase();
    if (hex === "#fff" || hex === "#ffffff") return `--${prefix}-color-white`;
    if (hex === "#000" || hex === "#000000") return `--${prefix}-color-black`;
    name += `-${index + 1}`;
  } else if (type === "spacing") {
    name += `-${value.replace(/[^a-zA-Z0-9]/g, "-")}`;
  } else if (type === "font") {
    const cleaned = value.replace(/["']/g, "").split(",")[0]!.trim().toLowerCase().replace(/\s+/g, "-");
    name += `-${cleaned}`;
  } else {
    name += `-${index + 1}`;
  }

  return name;
}

function generateRootBlock(variables: Map<string, string>, prefix: string): string {
  const lines = [":root {"];
  const grouped: Record<string, Array<[string, string]>> = { color: [], spacing: [], font: [] };

  for (const [varName, value] of variables) {
    if (varName.includes(`-${prefix}-color`)) {
      (grouped.color as Array<[string, string]>).push([varName, value]);
    } else if (varName.includes(`-${prefix}-spacing`)) {
      (grouped.spacing as Array<[string, string]>).push([varName, value]);
    } else if (varName.includes(`-${prefix}-font`)) {
      (grouped.font as Array<[string, string]>).push([varName, value]);
    }
  }

  if (grouped.color!.length > 0) {
    lines.push("  /* Colors */");
    for (const [name, val] of grouped.color!) lines.push(`  ${name}: ${val};`);
  }
  if (grouped.spacing!.length > 0) {
    lines.push("  /* Spacing */");
    for (const [name, val] of grouped.spacing!) lines.push(`  ${name}: ${val};`);
  }
  if (grouped.font!.length > 0) {
    lines.push("  /* Fonts */");
    for (const [name, val] of grouped.font!) lines.push(`  ${name}: ${val};`);
  }

  lines.push("}");
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.json) {
    console.log(`\n${c.bgBlue}${c.white}${c.bold} ${TOOL_NAME} v${VERSION} ${c.reset}\n`);
  }

  // Find CSS files
  const cssFiles: string[] = [];
  for (const p of opts.paths) {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved)) {
      if (!opts.json) {
        console.log(`${c.red}Error:${c.reset} Path not found: ${p}`);
      }
      continue;
    }
    cssFiles.push(...findCssFiles(resolved));
  }

  if (cssFiles.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ error: "No CSS files found", files: 0, variables: 0 }));
    } else {
      console.log(`${c.yellow}No CSS files found in the specified paths.${c.reset}`);
    }
    process.exit(1);
  }

  if (!opts.json) {
    console.log(`${c.cyan}Scanning ${c.bold}${cssFiles.length}${c.reset}${c.cyan} CSS file(s)...${c.reset}\n`);
  }

  // Extract all values across files
  const allValues = new Map<string, ExtractedValue>();
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const fileValues = extractValues(content, file, opts.scope);
    for (const [key, val] of fileValues) {
      const existing = allValues.get(key);
      if (existing) {
        existing.locations.push(...val.locations);
      } else {
        allValues.set(key, { ...val });
      }
    }
  }

  // Filter by minimum occurrences
  const repeated = new Map<string, ExtractedValue>();
  for (const [key, val] of allValues) {
    if (val.locations.length >= opts.min) {
      repeated.set(key, val);
    }
  }

  if (repeated.size === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ files: cssFiles.length, variables: 0, message: "No repeated values found" }));
    } else {
      console.log(`${c.green}No repeated values found (min: ${opts.min}).${c.reset}`);
    }
    process.exit(0);
  }

  // Generate variable names
  const varMap = new Map<string, string>(); // value -> var name
  const rootVars = new Map<string, string>(); // var name -> value
  const counters = { color: 0, spacing: 0, font: 0 };

  for (const [value, info] of repeated) {
    const idx = counters[info.type]++;
    const varName = generateVarName(opts.prefix, info.type, value, idx);
    varMap.set(value, varName);
    rootVars.set(varName, value);
  }

  // JSON output
  if (opts.json) {
    const results = {
      files: cssFiles.length,
      variables: repeated.size,
      dryRun: opts.dryRun,
      extractions: Array.from(repeated.entries()).map(([value, info]) => ({
        value,
        variable: varMap.get(value),
        type: info.type,
        occurrences: info.locations.length,
        locations: info.locations,
      })),
      rootBlock: generateRootBlock(rootVars, opts.prefix),
    };
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  // Display results
  console.log(`${c.bold}Found ${c.magenta}${repeated.size}${c.reset}${c.bold} repeated values:${c.reset}\n`);

  for (const [value, info] of repeated) {
    const varName = varMap.get(value)!;
    const icon = info.type === "color" ? "🎨" : info.type === "spacing" ? "📐" : "🔤";
    console.log(`  ${icon} ${c.bold}${c.cyan}${varName}${c.reset}: ${c.yellow}${value}${c.reset} ${c.dim}(${info.locations.length} occurrences)${c.reset}`);
    for (const loc of info.locations.slice(0, 3)) {
      const relPath = path.relative(process.cwd(), loc.file);
      console.log(`     ${c.dim}${relPath}:${loc.line} (${loc.property})${c.reset}`);
    }
    if (info.locations.length > 3) {
      console.log(`     ${c.dim}... and ${info.locations.length - 3} more${c.reset}`);
    }
    console.log();
  }

  // Generate :root block
  const rootBlock = generateRootBlock(rootVars, opts.prefix);
  console.log(`${c.bold}Generated :root block:${c.reset}\n`);
  console.log(`${c.green}${rootBlock}${c.reset}\n`);

  if (opts.dryRun) {
    console.log(`${c.yellow}${c.bold}DRY RUN${c.reset}${c.yellow} - no files were modified.${c.reset}`);
    console.log(`${c.dim}Remove --dry-run to apply changes.${c.reset}\n`);
  } else {
    // Apply changes to files
    let totalReplacements = 0;
    for (const file of cssFiles) {
      let content = fs.readFileSync(file, "utf-8");
      let modified = false;

      for (const [value, varName] of varMap) {
        // Escape for regex
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "g");
        const matches = content.match(regex);
        if (matches && matches.length > 0) {
          content = content.replace(regex, `var(${varName})`);
          totalReplacements += matches.length;
          modified = true;
        }
      }

      if (modified) {
        // Add :root block at the top if it doesn't exist
        if (!content.includes(":root")) {
          content = rootBlock + "\n\n" + content;
        }
        fs.writeFileSync(file, content, "utf-8");
        const relPath = path.relative(process.cwd(), file);
        console.log(`  ${c.green}✓${c.reset} Updated ${c.cyan}${relPath}${c.reset}`);
      }
    }

    console.log(`\n${c.green}${c.bold}Done!${c.reset} ${totalReplacements} replacements across ${cssFiles.length} file(s).\n`);
  }
}

main();
