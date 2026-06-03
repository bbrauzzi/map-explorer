// Make Vitest's globals (describe/it/expect/vi) and the jest-dom matcher types
// available to tsc across the test files without an explicit import in each one.
// Triple-slash references are additive, so they don't disturb the default
// auto-inclusion of @types/react (which provides the global JSX namespace).
/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />
