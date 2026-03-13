# Feishu

AgentChat 0.0.1 supports **Feishu private chat**.

## Included in 0.0.1

- private-chat bot messages routed to the current target
- current target can be a direct session or a room
- unified `/sessions`, `/use`, and `/progress` flow
- menu events for help, session list, and current progress

## Not included in 0.0.1

- group binding
- file/image handling
- OAuth account linking flows
- complex interactive cards

## Typical menu setup

Recommended menu buttons:

- help
- view / switch targets
- current progress

## Typical command flow

```text
/sessions
/use 1
/progress
```

## Notes

- duplicate menu events are deduplicated by event id
- provider/runtime errors are returned to the user directly in chat
- if no machine is online for the namespace, Feishu replies with that error instead of failing silently
