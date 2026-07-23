#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

classes_dir="build/core-classes"
sources_file="build/core-sources.txt"

mkdir -p "$classes_dir"
find src/core/java -name '*.java' -type f | sort > "$sources_file"
javac --release 21 -Xlint:all -Werror -d "$classes_dir" @"$sources_file"
