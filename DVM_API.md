# Video Transform DVM API

This document describes how to interact with the Video Transform Data Vending Machine (DVM). This DVM supports a competitive marketplace flow using NIP-90, NIP-17 (Gift Wraps), and Cashu payments.

## Overview

| Event Kind | Description                                    |
| ---------- | ---------------------------------------------- |
| 5207       | Job Request (video transform)                  |
| 6207       | Job Result                                     |
| 7000       | Job Status / Bid / Feedback                    |
| 1059       | Gift Wrap (used for private Selection/Payment) |

---

## The Marketplace Flow (Discovery & Selection)

To allow for competition and avoid pre-payment risks, the DVM supports the following flow:

### 1. Discovery (Job Request)

The caller broadcasts a global `kind: 5207` event. To receive multiple bids, do **not** include a `p` tag for a specific DVM.

```json
{
  "kind": 5207,
  "content": "",
  "tags": [
    ["i", "https://example.com/video.mp4", "url"],
    ["param", "mode", "hls"],
    ["relays", "wss://relay.damus.io"]
  ]
}
```

### 2. Bidding (DVM Offer)

Available DVMs will respond with a `kind: 7000` status event containing their offer.

| Tag      | Description                                              |
| -------- | -------------------------------------------------------- |
| `status` | `payment-required`                                       |
| `amount` | Amount in sats (e.g., `"0"` for free, `"1000"` for paid) |
| `cashu`  | The Mint URL (if payment is required)                    |

### 3. Selection (Caller Trigger)

The caller reviews the bids and selects a DVM using one of two methods:

#### Method A: Public Selection (Free Jobs)

Send a `kind: 7000` event directed to the chosen DVM.

```json
{
  "kind": 7000,
  "tags": [
    ["e", "<original-job-id>"],
    ["p", "<chosen-dvm-pubkey>"],
    ["status", "approved"]
  ]
}
```

#### Method B: Private Selection & Payment (Paid Jobs)

Send a `kind: 1059` (Gift Wrap) to the DVM containing a `kind: 5207` Rumor.

- The Rumor must be directed to the DVM (`p` tag).
- The Rumor must include a `cashu` tag with the valid token.

```json
// Inside the NIP-17 Rumor
{
  "kind": 5207,
  "tags": [
    ["i", "https://example.com/video.mp4", "url"],
    ["p", "<dvm-pubkey>"],
    ["cashu", "<cashu-token-v3-or-v4>"]
  ]
}
```

---

## Making a Direct Request

If you already know the DVM pubkey and its price, you can skip discovery and send a directed request immediately.

### Required Tags

| Tag     | Description                              |
| ------- | ---------------------------------------- |
| `i`     | Input video URL: `["i", "<url>", "url"]` |
| `p`     | DVM public key: `["p", "<dvm-pubkey>"]`  |
| `cashu` | (Optional) Cashu payment token           |

---

## Status Updates (Kind 7000)

Status values used by this DVM:

| Status             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `payment-required` | Sent as a Bid or if a directed request lacks payment |
| `processing`       | Job is active                                        |
| `success`          | Job completed                                        |
| `error`            | Job failed                                           |
| `approved`         | (Incoming) Signal from user to start a free job      |

---

## Job Result (Kind 6207)

The result always references the **original** Job Request ID in the `e` tag.

```json
{
  "kind": 6207,
  "content": "{...}",
  "tags": [
    ["e", "<original-job-id>"],
    ["p", "<requester-pubkey>"]
  ]
}
```
