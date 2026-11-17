#!/bin/zsh
# usage: record-chain.sh name seconds... — chained screencast segments (each < 110 s)
cd "$(dirname "$0")/.."
name=$1; shift
i=0
for secs in "$@"; do
  echo $secs > .recording/duration.txt
  npx @iwsdk/cli browser run tools/record.mjs --timeout 108000 > .recording/rec-$name-$i.log 2>&1
  rm -rf .recording/$name-$i; mv .recording/frames .recording/$name-$i; cp .recording/index.json .recording/$name-$i/index.json
  i=$((i+1))
done
echo "recorded $name"
