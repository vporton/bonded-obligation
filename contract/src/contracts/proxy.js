/* eslint-disable no-use-before-define */
import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';
import { makeZoeHelpers } from '@agoric/zoe/src/contractSupport';

import { makeTimeRelease } from './pledge';
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

  let pledges = new Map(); // from handle ({}) to payment

  let nonce = 0;

  return zcf.addNewIssuer(issuer, 'Wrapper').then(() => {
    const adminHook = userOfferHandle => {
    }

    // the contract creates an offer {give: wrapper, want: nothing} with the time release wrapper
    const sendPledgeHook = (pledge, ransomAmount, handle, date) => userOfferHandle => {
      const lock = makePledge(zcf, timerService, pledge, ransomAmount, date);

      const wrapperAmount = wrapperToken(harden([[harden(lock), ++nonce]]));
      const wrapperPayment = mint.mintPayment(wrapperAmount);

      let tempContractHandle;
      const contractSelfInvite = zcf.makeInvitation(
        offerHandle => (tempContractHandle = offerHandle),
      );

      pledges.set(handle, wrapperPayment);

      zcf
        .getZoeService()
        .offer(
          contractSelfInvite,
          harden({ /*give: { Wrapper: wrapperAmount }*/ }),
          harden({ Wrapper: wrapperPayment }),
        ).then(() => {
          // Don't forget to call this, otherwise the other side won't be able to get the money:
          //lock.setOffer(tempContractHandle);

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
      const payment = pledges.get(handle);
      if(!payment) {
        return `Trying to get non-exisiting payment.`;
      }
      const wrapperAmount = wrapperToken(harden([[payment, ++nonce]]));
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
          zcf.reallocate(
            [tempContractHandle, userOfferHandle],
            [
              zcf.getCurrentAllocation(userOfferHandle),
              zcf.getCurrentAllocation(tempContractHandle),
            ],
          );
          zcf.complete([tempContractHandle, userOfferHandle]); // FIXME: enough just one of them?
          pledges.delete(handle); // We already delivered it.
          return `Scheduled payment delivered.`;
        });
    }
    
    const { inviteAnOffer } = makeZoeHelpers(zcf);   
    
    const makeSendPledgeInvite = (payment, handler, date) => () =>
      inviteAnOffer(
        harden({
          offerHook: sendPledgeHook(payment, handler, date),
          customProperties: { inviteDesc: 'offer' },
        }),
      );

    const makeReceivePledgeInvite = handle => () =>
      inviteAnOffer(
        harden({
          offerHook: receivePledgeHook(handle),
          customProperties: { inviteDesc: 'get money' },
        }),
      );

    return harden({
      invite: zcf.makeInvitation(adminHook),
      publicAPI: {
        makeSendInvite: makeSendPledgeInvite,
        makeReceivePledgeInvite,
        makeReceiveRansomInvite,
        //currency: wrapperToken,
        issuer: issuer,
      },
    });
  });
});
