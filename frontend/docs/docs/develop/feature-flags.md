# Feature Flags

## Introduction

Feature flags are a powerful tool for managing and controlling the release of new features in a software application. They allow developers to enable or disable specific features at runtime without deploying new releases, making it easier to test and deploy new features in a controlled manner.

## Implementation

In Browsertrix, feature flags are implemented as an object stored on the `Organization` model. This object contains a set of key-value pairs, where the key is the name of the feature flag and the value is a boolean indicating whether the feature is enabled or disabled.

### Consuming Feature Flags

On the back-end, feature flags are available through `has_feature` method on an `Organization` instance, with `FeatureFlags` available from `.models` as an enum of available feature flags:

```python
def do_something(org: Organization):
    if org.has_feature(FeatureFlags.NEW_FEATURE):
        # do something
```

On the front-end, you can access feature flags using the `featureFlags.has` method on any element inheriting from `BtrixElement`:

```typescript
class MyElement extends BtrixElement {
  render() {
    if (this.featureFlags.has('new-feature')) {
      // render new feature
    }
  }
}
```

### Adding a New Feature Flag

There are a few steps to adding a new feature flag:

1. In `backend/btrixcloud/models.py`, add a new value to the `FeatureFlags` enum:

```python
class FeatureFlags(StrEnum):
    # ...
    NEW_FEATURE = 'new-feature'
```

2. Also in `backend/btrixcloud/models.py`, add a new entry to the `FLAG_METADATA` dict:

```python
FLAG_METADATA: dict[FeatureFlags, FeatureFlag] = {
    # ...
    FeatureFlags.NEW_FEATURE: FeatureFlag(
        description="Detailed description of the feature flag. It should explain what the flag does and why it is needed.",
        owner="@your_username", # Replace with your GitHub username or email
        expiry=date(2069, 1, 2), # Pick a date when you expect the feature to be fully implemented and ready for production. This doesn't currently do anything, but it's a good practice to set an expiry date.
        scope="org", # Currently "org" is the only option, but it might be expanded in the future.
        defaultValue=False,
    ),
}
```

3. In `frontend/src/types/featureFlags.ts`, add a new value to the `FeatureFlags` type:

```typescript
export type FeatureFlags = 
  // ...
  | "new-feature";
```

## Best Practices

- **Keep feature flags simple**: Feature flags should be simple and easy to understand.
- **Document feature flags**: Feature flags should be documented using the `FLAG_METADATA` dictionary.
- **Intend to remove feature flags**: Feature flags should be intended to be removed after a certain period of time. They shouldn't be used for things like gating features based on subscription levels or user roles.

Feature flags as they're currently implemented in Browsertrix are intended to be used for experimental features that are not yet ready for production. They should be used sparingly and only when necessary; they're not designed to be used as circuit breakers or ops/permission toggles at this stage.
