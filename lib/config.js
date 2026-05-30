// Super-admin email. Set NEXT_PUBLIC_ADMIN_EMAIL in .env.local to override.
// Falls back to the hardcoded value so existing deployments without the env
// var continue to work without any configuration change.
export const ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'abdelhafidbaadi@gmail.com'
