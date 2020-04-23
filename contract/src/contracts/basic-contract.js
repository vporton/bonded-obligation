/* eslint-disable no-use-before-define */
import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';

// zcf is the Zoe Contract Facet, i.e. the contract-facing API of Zoe
export const makeContract = harden(zcf => {
  // Create the internal token mint
  const currencyIssuer = produceIssuer('BaytownBucks')
  const { mint: baytownBucksMint, issuer } = currencyIssuer;
  const baytownBucks = issuer.getAmountMath().make;

  return zcf.addNewIssuer(issuer, 'Token').then(() => {
    // the contract creates an offer {give: tokens, want: nothing} with the tickets
    const offerHook = userOfferHandle => {
      const ticketsAmount = baytownBucks(1000);
      const ticketsPayment = baytownBucksMint.mintPayment(ticketsAmount);

      let tempContractHandle;
      const contractSelfInvite = zcf.makeInvitation(
        offerHandle => (tempContractHandle = offerHandle),
      );

      zcf
        .getZoeService()
        .offer(
          contractSelfInvite,
          harden({ give: { Token: ticketsAmount } }),
          harden({ Token: ticketsPayment }),
        ).then(() => {
          zcf.reallocate(
            [tempContractHandle, userOfferHandle],
            [
              zcf.getCurrentAllocation(userOfferHandle),
              zcf.getCurrentAllocation(tempContractHandle),
            ],
          );
          zcf.complete([tempContractHandle, userOfferHandle]); // FIXME: enough just one of them?
          return `Payment scheduled.`;
        });
    }
    return harden({
      invite: zcf.makeInvitation(offerHook),
      publicAPI: {
        currency: baytownBucks,
        issuer: issuer,
      },
    });
  });
});
