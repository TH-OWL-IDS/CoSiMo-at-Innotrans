import type { CollectionConfig } from "payload";

/** Admin/operator accounts for the Payload dashboard and host console. */
export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: { useAsTitle: "email", group: "System" },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "role",
      type: "select",
      defaultValue: "operator",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Operator", value: "operator" },
      ],
    },
  ],
};
