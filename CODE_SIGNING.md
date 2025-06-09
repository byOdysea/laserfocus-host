# Code Signing & Notarization Setup

## 🍎 Apple Developer Requirements

### 1. Apple Developer Account
- **Cost**: $99/year
- **Sign up**: [developer.apple.com/programs](https://developer.apple.com/programs/)
- **Wait**: 24-48 hours for approval

### 2. Create Certificates
1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
2. Create **"Developer ID Application"** certificate
3. Download and install in Keychain Access

### 3. App-Specific Password
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → App-Specific Passwords → Generate
3. Save the generated password

## 🔧 Environment Setup

Create/update your `.env` file with:

```bash
# Apple Code Signing & Notarization
APPLE_ID=your-apple-id@example.com
APPLE_ID_PASSWORD=your-app-specific-password
APPLE_TEAM_ID=your-team-id
CSC_IDENTITY_AUTO_DISCOVERY=true
# Or specify exact certificate:
# CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
```

## 🚀 Building Signed Apps

### For Production Builds:
```bash
# Build and sign automatically
yarn build && yarn package-mac
```

### For Testing Signing:
```bash
# Check available certificates
security find-identity -v -p codesigning

# Build with specific certificate
CSC_NAME="Developer ID Application: Your Name" yarn package-mac
```

## 🔍 Verification

After building, verify your app is signed:

```bash
# Check code signature
codesign -vvv --deep --strict release/mac-arm64/Laserfocus.app

# Check notarization
spctl -a -vvv -t install release/mac-arm64/Laserfocus.app
```

## 🐛 Troubleshooting

### Common Issues:

1. **"No identity found"**
   - Ensure certificate is installed in Keychain
   - Check certificate type is "Developer ID Application"

2. **Notarization fails**
   - Verify Apple ID and app-specific password
   - Check team ID matches your developer account

3. **"Invalid entitlements"**
   - Review `assets/entitlements.mac.plist`
   - Ensure all required entitlements are present

### Useful Commands:

```bash
# List all certificates
security find-identity -v

# Check app bundle
codesign -dvvv release/mac-arm64/Laserfocus.app

# Force rebuild with signing
yarn clean && yarn build && yarn package-mac
```

## 📦 Distribution

Once signed and notarized:
- ✅ No security warnings on macOS
- ✅ Can be distributed outside App Store
- ✅ Users can install with simple double-click
- ✅ Professional appearance and trust 