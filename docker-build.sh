#!/bin/bash

docker buildx build --platform linux/arm64,linux/amd64 -t mitrehealthdocker/bulk-export-server:latest -f Dockerfile . --push