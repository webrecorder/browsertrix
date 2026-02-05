# Feature Flags

## Introduction

Feature flags are a powerful tool for managing and controlling the release of new features in a software application. They allow developers to enable or disable specific features at runtime without deploying new releases, making it easier to test and deploy new features in a controlled manner.

## Implementation

In Browsertrix, feature flags are implemented as an object stored on the `Organization` model. This object contains a set of key-value pairs, where the key is the name of the feature flag and the value is a boolean indicating whether the feature is enabled or disabled.

### Consuming Feature Flags

On the back-end, feature flags are available through the `featureFlags` property on an `Organization` instance:

```python
def do_something(org: Organization):
    if org.featureFlags.newFeature:
        # do something
```

On the front-end, you can access feature flags using the `featureFlags.has` method on any element inheriting from `BtrixElement`:

```typescript
class MyElement extends BtrixElement {
  render() {
    if (this.featureFlags.has('newFeature')) {
      // render new feature
    }
  }
}
```

### Adding a New Feature Flag

There are a few steps to adding a new feature flag:

1. In `backend/btrixcloud/models.py`, add a new field to the `FeatureFlags` model:

```python
class FeatureFlags(ValidatedFeatureFlags):
    # ...
    newFeature: bool = Field(
        description="Detailed description of the feature flag. It should explain what the flag does and why it is needed.",
        default=False,
    )
```

3. In `frontend/src/types/featureFlags.ts`, add a new value to the `FeatureFlags` type:

```typescript
export type FeatureFlags = 
  // ...
  | "newFeature";
```

## Best Practices

- **Keep feature flags simple**: Feature flags should be simple and easy to understand.
- **Document feature flags**: Feature flags must be documented using the `description` property in the `Field` definition.
- **Intend to remove feature flags**: Feature flags should be intended to be removed after a certain period of time. They shouldn't be used for things like gating features based on subscription levels or user roles.

Feature flags as they're currently implemented in Browsertrix are intended to be used for experimental/beta features that are not yet ready for production. They should be used sparingly and only when necessary; they're not designed to be used as circuit breakers or ops/permission toggles at this stage.
