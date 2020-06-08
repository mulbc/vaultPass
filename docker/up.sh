#!/bin/bash

docker-compose up -d --build
docker-compose exec vault /vault/unseal.sh
docker-compose exec vault /vault/config.sh
