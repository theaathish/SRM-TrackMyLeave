#!/bin/bash
# filepath: /Users/user/Workspace/Projects/Research/leaveform/scripts/build-android.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
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

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_step "Starting Android build process..."

# Check for required tools
print_step "Checking required tools..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    print_error "npx is not available"
    exit 1
fi

if ! command -v java &> /dev/null; then
    print_error "Java is not installed"
    exit 1
fi

print_success "All required tools are available"

# Clean previous builds
print_step "Cleaning previous builds..."
rm -rf android/app/build/outputs/
npm run clean:android || true

# Install dependencies
print_step "Installing dependencies..."
npm install

# Prebuild
print_step "Running Expo prebuild..."
npx expo prebuild --clean --platform android

# Check if Android directory exists
if [ ! -d "android" ]; then
    print_error "Android directory was not created. Prebuild failed."
    exit 1
fi

print_success "Prebuild completed successfully"

# Build APK
print_step "Building Release APK..."
cd android
./gradlew assembleRelease

if [ $? -eq 0 ]; then
    print_success "APK build completed successfully"
    APK_PATH=$(find app/build/outputs/apk/release -name "*.apk" | head -1)
    if [ -n "$APK_PATH" ]; then
        APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
        print_success "APK created: $APK_PATH (Size: $APK_SIZE)"
    fi
else
    print_error "APK build failed"
    exit 1
fi

# Build AAB
print_step "Building Release AAB..."
./gradlew bundleRelease

if [ $? -eq 0 ]; then
    print_success "AAB build completed successfully"
    AAB_PATH=$(find app/build/outputs/bundle/release -name "*.aab" | head -1)
    if [ -n "$AAB_PATH" ]; then
        AAB_SIZE=$(du -h "$AAB_PATH" | cut -f1)
        print_success "AAB created: $AAB_PATH (Size: $AAB_SIZE)"
    fi
else
    print_error "AAB build failed"
    exit 1
fi

cd ..

print_success "🎉 Android build process completed successfully!"
print_step "Build outputs:"
echo "📱 APK: android/app/build/outputs/apk/release/"
echo "📦 AAB: android/app/build/outputs/bundle/release/"

# Optional: Open output directory
if command -v open &> /dev/null; then
    read -p "Open build output directory? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open android/app/build/outputs/
    fi
elif command -v xdg-open &> /dev/null; then
    read -p "Open build output directory? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open android/app/build/outputs/
    fi
fi