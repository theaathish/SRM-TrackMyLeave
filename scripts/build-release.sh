#!/bin/bash
cd ..  # Change to project root
# filepath: /Users/user/Workspace/Projects/Research/leaveform/scripts/build-release.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}🔧 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_step "🚀 Building TrackMyLeave for Production Release"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
BUILD_DATE=$(date +"%Y%m%d_%H%M%S")
BUILD_DIR="builds/v${VERSION}_${BUILD_DATE}"

print_step "Version: $VERSION"
print_step "Build Date: $BUILD_DATE"

# Create builds directory
mkdir -p "$BUILD_DIR"

# Run the main build script
./scripts/build-android.sh

# Copy build outputs with versioned names
print_step "Copying build outputs..."

APK_SOURCE="android/app/build/outputs/apk/release/app-release.apk"
AAB_SOURCE="android/app/build/outputs/bundle/release/app-release.aab"

APK_DEST="$BUILD_DIR/TrackMyLeave_v${VERSION}_${BUILD_DATE}.apk"
AAB_DEST="$BUILD_DIR/TrackMyLeave_v${VERSION}_${BUILD_DATE}.aab"

if [ -f "$APK_SOURCE" ]; then
    cp "$APK_SOURCE" "$APK_DEST"
    APK_SIZE=$(du -h "$APK_DEST" | cut -f1)
    print_success "APK copied to: $APK_DEST (Size: $APK_SIZE)"
else
    print_error "APK not found at $APK_SOURCE"
fi

if [ -f "$AAB_SOURCE" ]; then
    cp "$AAB_SOURCE" "$AAB_DEST"
    AAB_SIZE=$(du -h "$AAB_DEST" | cut -f1)
    print_success "AAB copied to: $AAB_DEST (Size: $AAB_SIZE)"
else
    print_error "AAB not found at $AAB_SOURCE"
fi

# Create build info file
BUILD_INFO="$BUILD_DIR/build_info.txt"
cat > "$BUILD_INFO" << EOF
TrackMyLeave - Build Information
===============================
Version: $VERSION
Build Date: $(date)
Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "N/A")
Git Branch: $(git branch --show-current 2>/dev/null || echo "N/A")
Node Version: $(node --version)
Platform: Android
Build Type: Release

Files:
- APK: $(basename "$APK_DEST")
- AAB: $(basename "$AAB_DEST")

Build completed successfully!
EOF

print_success "Build info saved to: $BUILD_INFO"

# Create README for the build
README_FILE="$BUILD_DIR/README.md"
cat > "$README_FILE" << EOF
# TrackMyLeave v$VERSION

## Installation

### APK Installation (Direct Install)
1. Download \`$(basename "$APK_DEST")\`
2. Enable "Install from unknown sources" in Android settings
3. Install the APK file

### AAB Installation (Google Play Store)
1. Upload \`$(basename "$AAB_DEST")\` to Google Play Console
2. Follow Google Play Store release process

## Features
- 🔐 Biometric authentication (fingerprint/face recognition)
- 📱 Leave request submission and tracking
- 👥 Director approval workflow
- 🗓️ Tamil Nadu holiday integration
- 📊 Analytics and reporting
- 🔄 Real-time notifications
- 🎨 Material Design UI

## System Requirements
- Android 7.0 (API level 24) or higher
- Biometric hardware (fingerprint/face recognition)
- Internet connection

## Build Information
- Version: $VERSION
- Build Date: $(date)
- Platform: Android
- Architecture: Universal (arm64-v8a, armeabi-v7a, x86, x86_64)

## Support
For issues or questions, contact the development team.
EOF

print_success "README created: $README_FILE"

print_success "🎉 Release build completed successfully!"
print_step "Build directory: $BUILD_DIR"

# List all files in build directory
echo -e "\n${BLUE}📁 Build Contents:${NC}"
ls -la "$BUILD_DIR"

# Calculate total size
TOTAL_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
print_success "Total build size: $TOTAL_SIZE"