#!/bin/bash

while true; do
  echo "Updating database $(date)"
  python3 update_db.py
  echo "Database updated"
  sleep 60
done
