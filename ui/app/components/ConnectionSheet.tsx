import React, { useEffect, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer, ProgressCircle } from "@dynatrace/strato-components/content";
import { FormField, Label, PasswordInput, TextInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { showToast } from "@dynatrace/strato-components/notifications";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Text } from "@dynatrace/strato-components/typography";
import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";
import { ACCOUNT_CONNECTION_SCHEMA } from "../settings/AppSettingsContext";

interface ConnectionValues {
  accountUuid: string;
  clientId: string;
  /** Masked when loaded in the browser; sending the masked value back keeps the stored secret. */
  clientSecret: string;
}

const EMPTY: ConnectionValues = { accountUuid: "", clientId: "", clientSecret: "" };

/**
 * Admin form for the Account Management API OAuth client, stored in the "account-connection"
 * app settings. The secret is never shown — only the app function can read it in plain text.
 */
export const ConnectionSheet = ({
  show,
  onClose,
  onSaved,
  status,
}: {
  show: boolean;
  onClose: () => void;
  /** Called after a successful save, e.g. to reload account data. */
  onSaved: () => void;
  /** Result of the last account data request, shown as connection status. */
  status?: React.ReactNode;
}) => {
  const [values, setValues] = useState<ConnectionValues>(EMPTY);
  const [stored, setStored] = useState<{ objectId: string; version: string; maskedSecret: string }>();
  const [secret, setSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    if (!show) return;
    setIsLoading(true);
    setLoadError(undefined);
    setSecret("");
    appSettingsObjectsClient
      .getAppSettingsObjects({ schemaId: ACCOUNT_CONNECTION_SCHEMA, addFields: "value" })
      .then(({ items }) => {
        const [object] = items;
        if (!object) {
          setValues(EMPTY);
          setStored(undefined);
          return;
        }
        const value = { ...EMPTY, ...(object.value as Partial<ConnectionValues>) };
        setValues(value);
        setStored({ objectId: object.objectId, version: object.version, maskedSecret: value.clientSecret });
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false));
  }, [show]);

  const hasStoredSecret = !!stored?.maskedSecret;
  const canSave =
    values.accountUuid.trim() !== "" && values.clientId.trim() !== "" && (secret !== "" || hasStoredSecret);

  const save = async () => {
    setIsSaving(true);
    const value = {
      accountUuid: values.accountUuid.trim(),
      clientId: values.clientId.trim(),
      clientSecret: secret !== "" ? secret.trim() : (stored?.maskedSecret ?? ""),
    };
    try {
      if (stored) {
        const updated = await appSettingsObjectsClient.putAppSettingsObjectByObjectId({
          objectId: stored.objectId,
          optimisticLockingVersion: stored.version,
          body: { value },
        });
        setStored({ ...stored, version: updated.version });
      } else {
        const created = await appSettingsObjectsClient.postAppSettingsObject({
          body: { schemaId: ACCOUNT_CONNECTION_SCHEMA, value },
        });
        if (created) setStored({ objectId: created.objectId, version: created.version, maskedSecret: "saved" });
      }
      setSecret("");
      showToast({ title: "Connection saved", type: "success" });
      onSaved();
    } catch (e) {
      showToast({
        title: "Failed to save connection",
        type: "critical",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet
      title="Account connection"
      show={show}
      onDismiss={onClose}
      actions={
        <Flex gap={8}>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="emphasized"
            color="primary"
            onClick={() => void save()}
            disabled={!canSave || isLoading}
            loading={isSaving}
          >
            Save
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16} style={{ maxWidth: 560 }}>
        <Text>
          OAuth client of the Account Management API with the scopes <code>account-uac-read</code> and{" "}
          <code>account-env-read</code>. Outbound connections to <code>sso.dynatrace.com</code> and{" "}
          <code>api.dynatrace.com</code> must be allowed in the environment settings.
        </Text>
        {status}
        {loadError && (
          <MessageContainer variant="critical">
            <MessageContainer.Title>Connection settings could not be loaded</MessageContainer.Title>
            <MessageContainer.Description>{loadError}</MessageContainer.Description>
          </MessageContainer>
        )}
        {isLoading ? (
          <ProgressCircle aria-label="Loading connection settings" />
        ) : (
          <>
            <FormField>
              <Label>Account UUID</Label>
              <TextInput
                value={values.accountUuid}
                onChange={(accountUuid) => setValues((v) => ({ ...v, accountUuid }))}
                placeholder="e.g. 1a2b3c4d-…"
              />
            </FormField>
            <FormField>
              <Label>OAuth client ID</Label>
              <TextInput
                value={values.clientId}
                onChange={(clientId) => setValues((v) => ({ ...v, clientId }))}
                placeholder="dt0s02.…"
              />
            </FormField>
            <FormField>
              <Label>OAuth client secret</Label>
              <PasswordInput
                value={secret}
                onChange={setSecret}
                placeholder={hasStoredSecret ? "Saved — leave empty to keep" : "dt0s02.…"}
              />
            </FormField>
          </>
        )}
      </Flex>
    </Sheet>
  );
};
