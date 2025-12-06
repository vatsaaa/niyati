# Contributing to Niyati

Thank you for your interest in contributing to Niyati! This guide will help you get started.

## 🚀 Quick Start

1. **Fork the repository** and clone it locally
2. **Install dependencies:**
   ```bash
   cd be/bff && npm install
   cd ../../ui && npm install
   ```
3. **Set up git hooks:**
   ```bash
   chmod +x scripts/setup-hooks.sh
   ./scripts/setup-hooks.sh
   ```

## 📋 Code Standards

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes (dependencies, etc.)

**Examples:**
```bash
git commit -m "feat(ui): add login form validation"
git commit -m "fix(bff): resolve geocoding API timeout"
git commit -m "docs: update README with setup instructions"
```

### Code Style

**JavaScript/React:**
- Use single quotes for strings
- 2 spaces for indentation
- Semicolons required
- 120 character line limit
- ES6+ features encouraged

**Formatting:**
- Run `npm run format` to auto-format code
- Pre-commit hooks will check formatting automatically

**Linting:**
- Run `npm run lint` to check for issues
- Run `npm run lint:fix` to auto-fix issues

## 🔍 Pre-commit Checks

Git hooks automatically run these checks before each commit:

1. **Linting** - ESLint checks for code quality
2. **Formatting** - Prettier checks for consistent style
3. **Security** - Scans for sensitive data patterns
4. **File size** - Prevents commits of large files (>5MB)

To bypass hooks (not recommended):
```bash
git commit --no-verify
```

## 🧪 Testing

Before submitting a PR:

```bash
# BFF
cd be/bff
npm test

# UI
cd ui
npm test
npm run build  # Verify build works
```

## 🔒 Security

### Dependency Scanning

Security scans run automatically:
- **Daily**: Scheduled vulnerability scans
- **On PR**: Dependency review
- **On push**: NPM audit

To run manually:
```bash
npm run audit:security
```

### Reporting Security Issues

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, email security concerns to the maintainers privately.

## 📦 Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and commit using conventional commits

3. **Push to your fork:**
   ```bash
   git push origin feat/your-feature-name
   ```

4. **Open a Pull Request** with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots (for UI changes)
   - Test results

5. **Wait for CI checks** to pass:
   - Linting
   - Tests
   - Build verification
   - Security scan

6. **Address review feedback** if requested

7. **Merge** once approved

## 🏗️ Project Structure

```
niyati/
├── be/bff/              # Backend for Frontend service
│   ├── src/
│   │   ├── index.js     # Main server entry
│   │   ├── routes/      # API route handlers
│   │   ├── services/    # Business logic
│   │   └── lib/         # Utilities
│   └── config/          # Environment configs
├── ui/                  # React frontend
│   ├── src/
│   │   ├── App.jsx      # Main component
│   │   ├── components/  # Reusable components
│   │   └── hooks/       # Custom React hooks
│   └── public/          # Static assets
└── .github/workflows/   # CI/CD pipelines
```

## 🎯 Areas for Contribution

- 🐛 **Bug fixes** - Check open issues
- ✨ **Features** - Propose in discussions first
- 📚 **Documentation** - Always welcome
- 🧪 **Tests** - Improve coverage
- ♿ **Accessibility** - WCAG compliance
- 🌐 **Internationalization** - Multi-language support

## 📝 Documentation

When adding features:
- Update relevant README files
- Add JSDoc comments to functions
- Include usage examples
- Update API documentation

## ⚡ Performance

- Keep bundle size minimal
- Optimize images and assets
- Use lazy loading where appropriate
- Profile before optimizing

## 🤝 Code Review

Reviewers will check:
- Code quality and style
- Test coverage
- Documentation
- Security implications
- Performance impact
- Breaking changes

## 📞 Getting Help

- 💬 **Discussions** - For questions and ideas
- 🐛 **Issues** - For bugs and feature requests
- 📧 **Email** - For security concerns

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

Thank you for contributing to Niyati! 🙏
