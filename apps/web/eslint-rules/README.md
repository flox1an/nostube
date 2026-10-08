# Custom ESLint Rules

This directory contains custom ESLint rules for the project.

## no-placeholder-comments

This rule detects and flags comments that start with "// In a real" (case-insensitive). These comments typically indicate placeholder implementations that should be replaced with real code.

### Examples

❌ **Bad** - These will trigger the rule:

```javascript
// In a real application, this would connect to a database
const data = []

// in a real world scenario, this would be different
const config = {}

/* In a real implementation, we would handle errors */
const handleError = () => {}
```

✅ **Good** - These are fine:

```javascript
// This is a regular comment
const data = []

// TODO: Implement database connection
const config = {}

// Note: In a real application, consider using a database
const handleError = () => {}
```

### Configuration

The rule is configured in `eslint.config.js` as:

```javascript
"custom/no-placeholder-comments": "error"
```

You can change the severity level to:

- `"off"` - Disable the rule
- `"warn"` - Show as warning
- `"error"` - Show as error (current setting)

### Purpose

This rule helps ensure that placeholder comments used during development are replaced with actual implementations before code is committed or deployed to production.
