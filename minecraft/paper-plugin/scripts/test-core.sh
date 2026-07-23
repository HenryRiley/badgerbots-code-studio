#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
classes_dir="$project_dir/build/core-test-classes"
sources_file="$project_dir/build/core-test-sources.txt"

mkdir -p "$classes_dir"
find "$project_dir/src/core/java" "$project_dir/src/test/java" -name '*.java' -type f | sort > "$sources_file"
javac --release 21 -Xlint:all -Werror -d "$classes_dir" @"$sources_file"
java -ea -cp "$classes_dir" org.badgerbots.studio.runtime.RuntimeCoreSelfTest
