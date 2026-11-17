#!/bin/zsh
# usage: breath-seq.sh hand xOpen xClosed cycles — one continuous breathing motion
cd "$(dirname "$0")/.."
hand=$1; xo=$2; xc=$3; n=${4:-5}
steps=""
for i in $(seq 1 $n); do
  steps+="{\"label\":\"in$i\",\"position\":{\"x\":$xo,\"y\":1.0,\"z\":1.56},\"anchor\":\"wrist\",\"duration\":3.8},{\"label\":\"top$i\",\"duration\":0.2},"
  steps+="{\"label\":\"out$i\",\"position\":{\"x\":$xc,\"y\":1.0,\"z\":1.56},\"anchor\":\"wrist\",\"duration\":5.8},{\"label\":\"bottom$i\",\"duration\":0.2},"
done
npx @iwsdk/cli xr run-sequence --input-json "{\"device\":\"hand-$hand\",\"steps\":[${steps%,}]}" 2>&1 | grep -E '"completed"|warn' | head -3
