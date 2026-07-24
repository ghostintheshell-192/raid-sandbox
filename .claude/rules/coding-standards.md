# Coding Standards

## Language-Specific Standards



## General Principles

### Naming Conventions

- Use clear, descriptive names
- Follow language conventions for casing
- Avoid abbreviations unless widely understood
- Be consistent within the codebase

### Code Style

- Use automated formatters where available
- Follow the principle of least surprise
- Keep functions/methods focused and small
- Prefer composition over inheritance

### File Organization

- One primary entity per file
- Group related functionality
- Use consistent directory structure
- Keep imports/dependencies organized

### Documentation

- **XML/JSDoc comments**: Required for public APIs
- **Language**: English only
- **Focus**: Explain "why", not "what"
- Keep comments up-to-date with code changes

### Error Handling

- Handle errors explicitly
- Use appropriate error types
- Provide meaningful error messages
- Log errors with sufficient context

### Testing

- Write tests for new features
- Maintain existing test coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### Dependencies

- Keep dependencies minimal
- Use well-maintained libraries
- Pin versions for reproducibility
- Document why each dependency is needed

## Code Review Guidelines

- Review for logic and architecture, not just syntax
- Check for security issues
- Verify tests are adequate
- Ensure documentation is updated
- Be constructive in feedback
