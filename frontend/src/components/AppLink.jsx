export default function AppLink({ href, navigate, ...props }) {
  function followLink(event) {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    navigate(href);
  }

  return <a {...props} href={href} onClick={followLink} />;
}
