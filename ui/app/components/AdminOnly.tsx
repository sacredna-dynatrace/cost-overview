import React from "react";
import { MessageContainer, ProgressCircle } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { useAppSettings } from "../settings/AppSettingsContext";

/**
 * Renders its children only for app admins. Hiding is a UI convenience — the actual protection
 * is the IAM policy on the app settings schemas.
 */
export const AdminOnly = ({ children }: React.PropsWithChildren) => {
  const { isAdmin, isAdminResolved } = useAppSettings();
  if (!isAdminResolved) {
    return (
      <Flex justifyContent="center" padding={32}>
        <ProgressCircle aria-label="Checking permissions" />
      </Flex>
    );
  }
  if (!isAdmin) {
    return (
      <Flex padding={24}>
        <MessageContainer variant="warning">
          <MessageContainer.Title>Admins only</MessageContainer.Title>
          <MessageContainer.Description>
            This page is available to app administrators only (users with write access to the
            Rate Card and Account connection settings). Ask your Dynatrace administrator for access.
          </MessageContainer.Description>
        </MessageContainer>
      </Flex>
    );
  }
  return <>{children}</>;
};
