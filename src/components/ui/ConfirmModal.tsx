import { useStore } from '../../state/store';
import { Button, Modal } from './primitives';

/**
 * App-styled confirmation dialog. Replaces window.confirm, which is
 * unreliable inside the Tauri WKWebView (it can silently return true).
 */
export function ConfirmModal() {
  const { state, actions } = useStore();
  const request = state.confirmDialog;
  const danger = request?.tone !== 'default';

  return (
    <Modal
      open={request !== null}
      onClose={() => actions.hideConfirm()}
      title={request?.title ?? ''}
      icon={danger ? 'alert' : 'info'}
      width={440}
      modalClassName="confirm-modal"
      footer={
        <>
          <Button variant="ghost" onClick={() => actions.hideConfirm()}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              const onConfirm = request?.onConfirm;
              actions.hideConfirm();
              onConfirm?.();
            }}
          >
            {request?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="confirm-message">{request?.message}</p>
    </Modal>
  );
}
