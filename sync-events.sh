#!/bin/bash

# Script to sync kind 21 and 22 events from relay.damus.io to strfry.apps3.slidestr.net
# Iterates backwards in time until no more events are found

SOURCE_RELAY="wss://relay.divine.video"
TARGET_RELAY="https://strfry.apps3.slidestr.net/"
KINDS="--kind 21 --kind 22 --kind 34235 --kind 34236"
LIMIT=500
MIN_RESULTS=2  # Stop if we get fewer than this many results

echo "Starting event sync from $SOURCE_RELAY to $TARGET_RELAY"
echo "================================================"

# Track statistics
TOTAL_PUBLISHED=0
ITERATION=0

# Initialize with no --until parameter for first fetch
UNTIL_PARAM=""

while true; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "Iteration $ITERATION: Fetching events..."

  # Fetch events and save to temporary file
  TEMP_FILE=$(mktemp)
  nak req $KINDS --limit $LIMIT $UNTIL_PARAM "$SOURCE_RELAY" > "$TEMP_FILE"

  # Count how many events we got
  EVENT_COUNT=$(grep -c '"kind":' "$TEMP_FILE" 2>/dev/null || echo "0")

  echo "Found $EVENT_COUNT events"

  # Stop if we got too few results
  if [ "$EVENT_COUNT" -lt "$MIN_RESULTS" ]; then
    echo "Only found $EVENT_COUNT events (less than $MIN_RESULTS). Stopping."
    rm "$TEMP_FILE"
    break
  fi

  # Publish events to target relay
  echo "Publishing $EVENT_COUNT events to $TARGET_RELAY..."
  cat "$TEMP_FILE" | nak event "$TARGET_RELAY"
  TOTAL_PUBLISHED=$((TOTAL_PUBLISHED + EVENT_COUNT))

  # Find the oldest (minimum) created_at timestamp from this batch
  OLDEST_TIMESTAMP=$(grep -o '"created_at":[0-9]*' "$TEMP_FILE" | cut -d: -f2 | sort -n | head -1)

  if [ -z "$OLDEST_TIMESTAMP" ]; then
    echo "Could not find created_at timestamp. Stopping."
    rm "$TEMP_FILE"
    break
  fi

  echo "Oldest timestamp in this batch: $OLDEST_TIMESTAMP ($(date -r "$OLDEST_TIMESTAMP" 2>/dev/null || date -d "@$OLDEST_TIMESTAMP" 2>/dev/null || echo "unknown date"))"

  # Set --until parameter for next iteration
  UNTIL_PARAM="--until $OLDEST_TIMESTAMP"

  # Clean up temporary file
  rm "$TEMP_FILE"

  # Brief pause to avoid overwhelming relays
  sleep 1
done

echo ""
echo "================================================"
echo "Sync complete!"
echo "Total iterations: $ITERATION"
echo "Total events published: $TOTAL_PUBLISHED"
