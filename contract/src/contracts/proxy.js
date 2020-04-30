/* eslint-disable no-use-before-define */
import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';
import { makeZoeHelpers } from '@agoric/zoe/src/contractSupport';

import { makeObligation } from './obligation';
import { cleanProposal } from '@agoric/zoe/src/cleanProposal';


// zcf is the Zoe Contract Facet, i.e. the contract-facing API of Zoe
/**
 * @type {import('@agoric/zoe').MakeContract}
 */
export const makeContract = harden(zcf => {
  const { terms: { timerService } = {} } = zcf.getInstanceRecord();

  // Create the internal token mint
  const { issuer, mint, amountMath } = produceIssuer(
    'Wrapper',
    'set',
  );
  const wrapperToken = amountMath.make;

  let senders = new Map(); // from handle ({}) to payment
  let receivers = new Map(); // from handle ({}) to payment

  let nonce = 0;

  return zcf.addNewIssuer(issuer, 'Wrapper').then(() => {
    const adminHook = userOfferHandle => {
    }

    // the contract creates an offer {give: wrapper, want: nothing} with the time release wrapper
    // `pledge` is a payment
    const sendPledgeHook = (receiver, pledge, ransomIssuer, ransomAmount, date) => async userOfferHandle => {
      const obligation = makeObligation(zcf, timerService, pledge, ransomIssuer, ransomAmount, date);

      // unique handles
      const senderHandle = {};
      const receiverHandle = {};

      senders.set(senderHandle, obligation);
      receivers.set(receiverHandle, obligation);

      const senderWrapperAmount = wrapperToken(harden([[harden(senderHandle)]]));
      const senderWrapperPayment = mint.mintPayment(senderWrapperAmount);

      const receiverWrapperAmount = wrapperToken(harden([[harden(receiverHandle), ++nonce]]));
      const receiverWrapperPayment = mint.mintPayment(receiverWrapperAmount);

      let tempContractHandle;
      const contractSelfInvite = zcf.makeInvitation(
        offerHandle => (tempContractHandle = offerHandle),
      );

      return zcf
        .getZoeService()
        .offer(
          contractSelfInvite,
          harden({ give: { Wrapper: senderWrapperAmount } }),
          harden({ Wrapper: senderWrapperPayment }),
        ).then(async () => {
          // Don't forget to call this, otherwise the other side won't be able to get the money:
          //lock.setOffer(tempContractHandle);

          receiver.receivePayment(receiverWrapperPayment)
          zcf.reallocate(
            [tempContractHandle, userOfferHandle],
            [
              zcf.getCurrentAllocation(userOfferHandle),
              zcf.getCurrentAllocation(tempContractHandle),
            ],
          );
          zcf.complete([tempContractHandle, userOfferHandle]); // FIXME: enough just one of them?
          return `Pledge accepted.`;
        });
    }

    const receivePledgeHook = handle => userOfferHandle => {
      const obligation = receivers.get(handle);
      if(!obligation) {
        return `Trying to get non-exisiting payment.`;
      }
      const wrapperAmount = wrapperToken(harden([[obligation.getPledge(), ++nonce]]));
      const wrapperPayment = mint.mintPayment(wrapperAmount);

      let tempContractHandle;
      const contractSelfInvite = zcf.makeInvitation(
        offerHandle => (tempContractHandle = offerHandle),
      );

      return zcf
        .getZoeService()
        .offer(
          contractSelfInvite,
          harden({ give: { Wrapper: wrapperAmount } }),
          harden({ Wrapper: wrapperPayment }),
        ).then(() => {
          zcf.reallocate(
            [tempContractHandle, userOfferHandle],
            [
              zcf.getCurrentAllocation(userOfferHandle),
              zcf.getCurrentAllocation(tempContractHandle),
            ],
          );
          zcf.complete([tempContractHandle, userOfferHandle]); // FIXME: enough just one of them?
          receivers.delete(handle); // We already delivered it.
          senders.delete(handle); // We already delivered it.
          return `Scheduled payment delivered.`;
        });
    }
    
    // Get back the pledge.
    const sendRansomHook = (handle, ransom) => userOfferHandle => {
      const obligation = senders.get(handle);
      if(!obligation) {
        return `Trying to get non-exisiting bond obligation.`;
      }

      const wrapperAmount = wrapperToken(harden([[obligation.getPledge().ransomAmount(), ++nonce]]));
      const wrapperPayment = mint.mintPayment(wrapperAmount);

      let tempContractHandle;
      const contractSelfInvite = zcf.makeInvitation(
        offerHandle => (tempContractHandle = offerHandle),
      );

      zcf
        .getZoeService()
        .offer(
          contractSelfInvite,
          harden({ give: { Wrapper: wrapperAmount } }),
          harden({ Wrapper: wrapperPayment }),
        ).then(() => {
          const amountMath = obligation.ransomIssuer().getAmountMath();
          if(!amountMath.isEqual(ransom.extent[0], obligation.ransomAmount())) {
            zcf.rejectOffer(userOfferHandle);
            return `Attempt to pay a wrong ransom amount.`;
          }
    
          zcf.reallocate(
            [tempContractHandle, userOfferHandle],
            [
              zcf.getCurrentAllocation(userOfferHandle),
              zcf.getCurrentAllocation(tempContractHandle),
            ],
          );
          zcf.complete([tempContractHandle, userOfferHandle]); // FIXME: enough just one of them?
          receivers.delete(handle); // We already delivered it.
          senders.delete(handle); // We already delivered it.
          return `Ransom accepted.`;
        });
    }
    
    const { inviteAnOffer } = makeZoeHelpers(zcf);   
    
    // `pledge` is a payment
    const makeSendPledgeInvite = (receiver, pledge, ransomIssuer, ransomAmount, date) => () =>
      inviteAnOffer(
        harden({
          offerHook: sendPledgeHook(receiver, pledge, ransomIssuer, ransomAmount, date),
          customProperties: { inviteDesc: 'offer' },
        }),
      );

      const makeReceivePledgeInvite = handle => () =>
      inviteAnOffer(
        harden({
          offerHook: receivePledgeHook(handle),
          customProperties: { inviteDesc: 'get pledge' },
        }),
      );

      const makeSendRansomInvite = (handle, ransom) => () =>
      inviteAnOffer(
        harden({
          offerHook: sendRansomHook(handle, ransom),
          customProperties: { inviteDesc: 'pay money' },
        }),
      );

    return harden({
      invite: zcf.makeInvitation(adminHook),
      publicAPI: {
        makeSendPledgeInvite,
        makeReceivePledgeInvite,
        makeSendRansomInvite,
        //currency: wrapperToken,
        issuer: issuer,
      },
    });

    // TODO: Query the pledge and ransom amounts.
  });
});
