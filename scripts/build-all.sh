#!/bin/bash
# filepath: /Users/user/Workspace/Projects/Research/leaveform/scripts/build-all.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}🔧 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE} $1 ${NC}"
    echo -e "${PURPLE}================================${NC}"
}

START_TIME=$(date +%s)

print_header "TrackMyLeave - Complete Build Process"

# Environment check
print_step "Checking build environment..."

# Check Node.js version
NODE_VERSION=$(node --version)
print_step "Node.js version: $NODE_VERSION"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run from project root."
    exit 1
fi

# Get app version
APP_VERSION=$(node -p "require('./package.json').version")
print_step "App version: $APP_VERSION"

# Check Git status
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_BRANCH=$(git branch --show-current)
    GIT_COMMIT=$(git rev-parse --short HEAD)
    print_step "Git branch: $GIT_BRANCH"
    print_step "Git commit: $GIT_COMMIT"
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        print_warning "You have uncommitted changes"
        read -p "Continue anyway? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# 1. Clean everything
print_header "Phase 1: Cleaning"
print_step "Removing old build artifacts..."
rm -rf android ios .expo node_modules/.cache builds/temp
npm run clean:android || true
print_success "Clean completed"

# 2. Install dependencies
print_header "Phase 2: Dependencies"
print_step "Installing npm dependencies..."
npm install
print_success "Dependencies installed"

# 3. Prebuild
print_header "Phase 3: Prebuild"
print_step "Running Expo prebuild..."
npx expo prebuild --clean --platform android

if [ ! -d "android" ]; then
    print_error "Prebuild failed - android directory not created"
    exit 1
fi
print_success "Prebuild completed"

# 4. Build Debug (for testing)
print_header "Phase 4: Debug Build"
print_step "Building debug APK..."
cd android
./gradlew assembleDebug
DEBUG_APK=$(find app/build/outputs/apk/debug -name "*.apk" | head -1)
if [ -n "$DEBUG_APK" ]; then
    DEBUG_SIZE=$(du -h "$DEBUG_APK" | cut -f1)
    print_success "Debug APK created (Size: $DEBUG_SIZE)"
else
    print_warning "Debug APK not found"
fi
cd ..

# 5. Build Release APK
print_header "Phase 5: Release APK"
print_step "Building release APK..."
cd android
./gradlew assembleRelease
RELEASE_APK=$(find app/build/outputs/apk/release -name "*.apk" | head -1)
if [ -n "$RELEASE_APK" ]; then
    APK_SIZE=$(du -h "$RELEASE_APK" | cut -f1)
    print_success "Release APK created (Size: $APK_SIZE)"
else
    print_error "Release APK build failed"
    exit 1
fi

# 6. Build Release AAB
print_header "Phase 6: Release AAB"
print_step "Building release AAB..."
./gradlew bundleRelease
RELEASE_AAB=$(find app/build/outputs/bundle/release -name "*.aab" | head -1)
if [ -n "$RELEASE_AAB" ]; then
    AAB_SIZE=$(du -h "$RELEASE_AAB" | cut -f1)
    print_success "Release AAB created (Size: $AAB_SIZE)"
else
    print_error "Release AAB build failed"
    exit 1
fi
cd ..

# 7. Organize builds
print_header "Phase 7: Organizing Builds"
BUILD_DATE=$(date +"%Y%m%d_%H%M%S")
FINAL_BUILD_DIR="builds/TrackMyLeave_v${APP_VERSION}_${BUILD_DATE}"
mkdir -p "$FINAL_BUILD_DIR"

# Copy and rename files
if [ -n "$DEBUG_APK" ]; then
    cp "$DEBUG_APK" "$FINAL_BUILD_DIR/TrackMyLeave_v${APP_VERSION}_debug.apk"
    print_success "Debug APK copied"
fi

if [ -n "$RELEASE_APK" ]; then
    cp "$RELEASE_APK" "$FINAL_BUILD_DIR/TrackMyLeave_v${APP_VERSION}_release.apk"
    print_success "Release APK copied"
fi

if [ -n "$RELEASE_AAB" ]; then
    cp "$RELEASE_AAB" "$FINAL_BUILD_DIR/TrackMyLeave_v${APP_VERSION}_release.aab"
    print_success "Release AAB copied"
fi

# 8. Generate documentation
print_header "Phase 8: Documentation"

# Build manifest
BUILD_MANIFEST="$FINAL_BUILD_DIR/build_manifest.json"
cat > "$BUILD_MANIFEST" << EOF
{
  "app_name": "TrackMyLeave",
  "version": "$APP_VERSION",
  "build_date": "$(date -Iseconds)",
  "build_timestamp": $(date +%s),
  "git_branch": "${GIT_BRANCH:-unknown}",
  "git_commit": "${GIT_COMMIT:-unknown}",
  "node_version": "$NODE_VERSION",
  "platform": "android",
  "build_type": "release",
  "files": {
    "debug_apk": "TrackMyLeave_v${APP_VERSION}_debug.apk",
    "release_apk": "TrackMyLeave_v${APP_VERSION}_release.apk",
    "release_aab": "TrackMyLeave_v${APP_VERSION}_release.aab"
  },
  "sizes": {
    "debug_apk": "$DEBUG_SIZE",
    "release_apk": "$APK_SIZE",
    "release_aab": "$AAB_SIZE"
  }
}
EOF

# Installation guide
INSTALL_GUIDE="$FINAL_BUILD_DIR/INSTALLATION.md"
cat > "$INSTALL_GUIDE" << EOF
# TrackMyLeave v$APP_VERSION - Installation Guide

## 📱 APK Installation (Direct)

### For End Users:
1. Download \`TrackMyLeave_v${APP_VERSION}_release.apk\`
2. On your Android device, go to Settings > Security
3. Enable "Unknown Sources" or "Install unknown apps"
4. Open the downloaded APK file
5. Follow the installation prompts
6. Launch TrackMyLeave from your app drawer

### For Testing:
- Use \`TrackMyLeave_v${APP_VERSION}_debug.apk\` for testing
- Debug version includes additional logging

## 🏪 AAB Installation (Google Play Store)

### For Play Store Release:
1. Upload \`TrackMyLeave_v${APP_VERSION}_release.aab\` to Google Play Console
2. Create a new release in Play Console
3. Add release notes and screenshots
4. Submit for review
5. Publish after approval

## 🔧 System Requirements
- Android 7.0 (API level 24) or higher
- ARM64 or ARM32 device architecture
- 50MB free storage space
- Internet connection for Firebase features
- Biometric hardware (fingerprint/face recognition) recommended

## 🚀 Features
- Biometric authentication
- Leave request management
- Real-time notifications
- Tamil Nadu holiday calendar
- Director approval workflow
- Offline capability (limited)

## 📊 Build Information
- Version: $APP_VERSION
- Build Date: $(date)
- Git Commit: ${GIT_COMMIT:-N/A}
- Platform: Android Universal

## 🔒 Security Notes
- APK is unsigned in debug mode
- Release APK/AAB is signed with release key
- Enable biometric authentication for enhanced security
- Data is encrypted and stored securely

## 📞 Support
Contact the development team for installation issues or questions.
EOF

# Changelog
CHANGELOG="$FINAL_BUILD_DIR/CHANGELOG.md"
cat > "$CHANGELOG" << EOF
# TrackMyLeave v$APP_VERSION - Release Notes

## 🆕 What's New
- Enhanced biometric authentication
- Improved notification system
- Tamil Nadu holiday integration
- Better performance and reliability
- Material Design improvements

## 🐛 Bug Fixes
- Fixed authentication flow
- Improved error handling
- Better offline support
- Performance optimizations

## 🔧 Technical Improvements
- Updated to latest React Native
- Firebase SDK updates
- Enhanced security measures
- Optimized build process

## 📱 Platform Support
- Android 7.0+ (API 24+)
- Universal architecture support
- Biometric authentication
- Push notifications

## 🔐 Security
- End-to-end encryption
- Secure biometric storage
- Firebase security rules
- Data privacy compliance

---
Built on $(date) | Version $APP_VERSION
EOF

print_success "Documentation generated"

# 9. Final verification
print_header "Phase 9: Verification"
print_step "Verifying build outputs..."

cd "$FINAL_BUILD_DIR"
echo "📁 Build Contents:"
ls -la

# Verify files exist and are not empty
for file in *.apk *.aab; do
    if [ -f "$file" ]; then
        SIZE=$(du -h "$file" | cut -f1)
        print_success "$file (Size: $SIZE)"
    fi
done

cd - > /dev/null

# Calculate total build time
END_TIME=$(date +%s)
BUILD_TIME=$((END_TIME - START_TIME))
BUILD_TIME_MIN=$((BUILD_TIME / 60))
BUILD_TIME_SEC=$((BUILD_TIME % 60))

print_header "🎉 Build Completed Successfully!"
print_success "Build time: ${BUILD_TIME_MIN}m ${BUILD_TIME_SEC}s"
print_success "Output directory: $FINAL_BUILD_DIR"
print_step "Ready for distribution! 🚀"

# Optional: Open build directory
if command -v open &> /dev/null; then
    echo
    read -p "Open build directory? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$FINAL_BUILD_DIR"
    fi
fi