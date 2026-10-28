import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { getAppVersion, getEnvironmentId } from "@dynatrace-sdk/app-environment";
import { useAppSettings } from "../settings/AppSettingsContext";

// Shown in the header so it is obvious which deployment and environment is being viewed.
const appVersion = getAppVersion();
const environmentId = getEnvironmentId();

export const Header = () => {
  // Keep the query string (e.g. ?tenant=) when switching pages.
  const { pathname, search } = useLocation();
  const { isAdmin } = useAppSettings();
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" />
        {isAdmin && (
          <AppHeader.NavigationItem
            as={Link}
            to={{ pathname: "/account", search }}
            isSelected={pathname === "/account"}
          >
            Account
          </AppHeader.NavigationItem>
        )}
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/", search }} isSelected={pathname === "/"}>
          Overview
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem
          as={Link}
          to={{ pathname: "/attribution", search }}
          isSelected={pathname === "/attribution"}
        >
          Usage Attribution
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem
          as={Link}
          to={{ pathname: "/coverage", search }}
          isSelected={pathname === "/coverage"}
        >
          Coverage
        </AppHeader.NavigationItem>
        {isAdmin && (
          <AppHeader.NavigationItem
            as={Link}
            to={{ pathname: "/rate-card", search }}
            isSelected={pathname === "/rate-card"}
          >
            Rate Card
          </AppHeader.NavigationItem>
        )}
      </AppHeader.Navigation>
      <AppHeader.ActionItems>
        <Text
          textStyle="small"
          style={{ color: Colors.Text.Neutral.Subdued, whiteSpace: "nowrap" }}
        >
          {environmentId} · v{appVersion}
        </Text>
      </AppHeader.ActionItems>
    </AppHeader>
  );
};
