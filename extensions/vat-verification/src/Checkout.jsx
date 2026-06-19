import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {
  useBuyerJourneyIntercept,
  useExtensionCapability,
} from '@shopify/ui-extensions/checkout/preact';

const VAT_METAFIELD_NAMESPACE = '$app:vat-verify';
const VAT_METAFIELD_KEY = 'vat_number';

export default function extension() {
  render(<Extension />, document.body);
}

function normalizeVatNumber(value) {
  return value.replace(/\s/g, '').toUpperCase();
}

function getFieldErrorMessage(validationStatus) {
  if (validationStatus === 'invalid') {
    return shopify.i18n.translate('vatInvalid');
  }

  if (validationStatus === 'error') {
    return shopify.i18n.translate('vatVerificationFailed');
  }

  return shopify.i18n.translate('vatValidationRequired');
}

function shouldBlockCheckout(vatNumber, validationStatus, validatedVatNumber) {
  const normalizedVat = normalizeVatNumber(vatNumber);

  if (!normalizedVat) {
    return false;
  }

  return !(validationStatus === 'valid' && normalizedVat === validatedVatNumber);
}

function Extension() {
  const editorType = shopify.extension.editor?.type;
  const blockProgressGranted = useExtensionCapability('block_progress');
  const canSetCartMetafields =
    shopify.instructions.value.metafields.canSetCartMetafields;

  const [vatNumber, setVatNumber] = useState('');
  const [validatedVatNumber, setValidatedVatNumber] = useState('');
  const [validationStatus, setValidationStatus] = useState('idle');
  const [fieldError, setFieldError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useBuyerJourneyIntercept(({canBlockProgress}) => {
    if (!canBlockProgress) {
      return {behavior: 'allow'};
    }

    if (!shouldBlockCheckout(vatNumber, validationStatus, validatedVatNumber)) {
      setFieldError('');
      return {behavior: 'allow'};
    }

    setFieldError(getFieldErrorMessage(validationStatus));

    return {
      behavior: 'block',
      reason: 'VAT verification required',
    };
  });

  return (
    <s-stack gap="base">
      {editorType === 'checkout' && !blockProgressGranted ? (
        <s-banner tone="warning" heading={shopify.i18n.translate('vatVerificationHeading')}>
          {shopify.i18n.translate('blockProgressNotEnabled')}
        </s-banner>
      ) : null}

      {!canSetCartMetafields ? (
        <s-banner tone="warning" heading={shopify.i18n.translate('vatVerificationHeading')}>
          {shopify.i18n.translate('metafieldChangesAreNotSupported')}
        </s-banner>
      ) : null}

      <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="start">
        <s-text-field
          label={shopify.i18n.translate('vatNumberPlaceholder')}
          name="vatNumber"
          value={vatNumber}
          error={fieldError}
          onInput={onVatInput}
        />

        <s-button
          type="button"
          variant="secondary"
          loading={isValidating}
          disabled={isValidating || !vatNumber.trim()}
          onClick={validateVat}
        >
          {shopify.i18n.translate('validateVatButton')}
        </s-button>
      </s-grid>

      {validationStatus === 'valid' && successMessage ? (
        <s-banner tone="success" heading={shopify.i18n.translate('vatVerifiedHeading')}>
          {successMessage}
        </s-banner>
      ) : null}
    </s-stack>
  );

  function onVatInput(event) {
    const nextValue = event.currentTarget.value;
    setVatNumber(nextValue);
    setFieldError('');

    if (!nextValue.trim()) {
      setValidationStatus('idle');
      setFieldError('');
      setSuccessMessage('');
      setValidatedVatNumber('');
      void saveVatMetafield('');
      return;
    }

    if (
      validatedVatNumber &&
      normalizeVatNumber(nextValue) !== validatedVatNumber
    ) {
      setValidationStatus('idle');
      setFieldError('');
      setSuccessMessage('');
      setValidatedVatNumber('');
      void saveVatMetafield('');
    }
  }

  async function saveVatMetafield(value) {
    if (!canSetCartMetafields) {
      return;
    }

    if (value) {
      await shopify.applyMetafieldChange({
        type: 'updateCartMetafield',
        metafield: {
          namespace: VAT_METAFIELD_NAMESPACE,
          key: VAT_METAFIELD_KEY,
          value,
          type: 'single_line_text_field',
        },
      });
      return;
    }

    await shopify.applyMetafieldChange({
      type: 'removeCartMetafield',
      namespace: VAT_METAFIELD_NAMESPACE,
      key: VAT_METAFIELD_KEY,
    });
  }

  async function validateVat() {
    const normalizedVat = normalizeVatNumber(vatNumber);

    if (!normalizedVat) {
      setValidationStatus('invalid');
      setFieldError(shopify.i18n.translate('vatNumberRequired'));
      return;
    }

    setIsValidating(true);
    setFieldError('');
    setSuccessMessage('');

    try {
      const response = await fetch(
        `https://api.vatcomply.com/vat?vat_number=${encodeURIComponent(normalizedVat)}`,
      );

      if (!response.ok) {
        throw new Error('VAT verification request failed');
      }

      const result = await response.json();

      if (result.valid) {
        setValidationStatus('valid');
        setValidatedVatNumber(normalizedVat);
        setVatNumber(normalizedVat);
        setFieldError('');

        const companyName =
          result.name && result.name !== '---' ? result.name : null;
        const verifiedMessage = companyName
          ? shopify.i18n.translate('vatVerifiedForCompany', {
              company: companyName,
            })
          : shopify.i18n.translate('vatVerifiedSuccess');
        setSuccessMessage(String(verifiedMessage));

        await saveVatMetafield(normalizedVat);
      } else {
        setValidationStatus('invalid');
        setValidatedVatNumber('');
        setFieldError(shopify.i18n.translate('vatInvalid'));
        await saveVatMetafield('');
      }
    } catch {
      setValidationStatus('error');
      setValidatedVatNumber('');
      setFieldError(shopify.i18n.translate('vatVerificationFailed'));
    } finally {
      setIsValidating(false);
    }
  }
}
