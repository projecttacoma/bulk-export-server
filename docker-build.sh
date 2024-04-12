#!/bin/bash

docker buildx build --platform linux/arm64,linux/amd64 -t tacoma/bulk-export-server:latest -f Dockerfile . --push