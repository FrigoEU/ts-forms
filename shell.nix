let
  pinnedNixpkgs = import (builtins.fetchTarball {
    name = "nixpkgs-21.11";
    url = https://github.com/NixOS/nixpkgs/archive/21.11.tar.gz;
    # Hash obtained using `nix-prefetch-url --unpack <url>`
    # sha256 = "0mhqhq21y5vrr1f30qd2bvydv4bbbslvyzclhw0kdxmkgg3z4c92";
  }) {config.android_sdk.accept_license = true;};
in
{ pkgs ? pinnedNixpkgs }:
let
  buildToolsVersion = "30.0.3";
  androidComposition = with pkgs; androidenv.composeAndroidPackages {
    toolsVersion = "26.1.1";
    # platformToolsVersion = "30.0.5";
    buildToolsVersions = [ buildToolsVersion ];
    includeEmulator = false;
    emulatorVersion = "30.3.4";
    platformVersions = [ "28" "29" "30" ];
    includeSources = false;
    includeSystemImages = false;
    systemImageTypes = [ "google_apis_playstore" ];
    abiVersions = [ "armeabi-v7a" "arm64-v8a" ];
    cmakeVersions = [ "3.10.2" ];
    includeNDK = true;
    ndkVersions = ["22.0.7026061"];
    useGoogleAPIs = false;
    useGoogleTVAddOns = false;
    includeExtras = [
      "extras;google;gcm"
    ];
  };
in
pkgs.stdenv.mkDerivation rec {
  name = "aperi-yunction";
  buildInputs = [
    pkgs.nodejs-16_x
    pkgs.gradle
    pkgs.jdk8
    pkgs.sqls
    androidComposition.androidsdk
    androidComposition.platform-tools
    androidComposition.build-tools
  ];
  ANDROID_SDK_ROOT = "${androidComposition.androidsdk}/libexec/android-sdk";
  ANDROID_NDK_ROOT = "${ANDROID_SDK_ROOT}/ndk-bundle";
  # ANDROID_HOME = "${ANDROID_SDK_ROOT}";
  # ANDROID_HOME = "/home/user/.android";

  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${ANDROID_SDK_ROOT}/build-tools/${buildToolsVersion}/aapt2";
  # ORG_GRADLE_PROJECT_cdvBuildToolsVersion=31;
  # ORG_GRADLE_PROJECT_cdvMinSdkVersion=31;
  # ORG_GRADLE_PROJECT_cdvCompileSdkVersion=31;
 
  shellHook = '' 
    export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/tools/bin:${ANDROID_SDK_ROOT}/tools:${ANDROID_SDK_ROOT}/build-tools/${buildToolsVersion}:$PATH"
  '';
}
