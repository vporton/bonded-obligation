// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from 'tape-promise/tape';
import bundleSource from '@agoric/bundle-source';
import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';
import { E } from '@agoric/eventual-send';
import { makeZoe } from '@agoric/zoe';
import buildManualTimer from '@agoric/zoe/tools/manualTimer'

const contractRoot = `${__dirname}/../src/contracts/proxy.js`;

test(`Time release contract`, async t => {
  // Setup initial conditions
  const zoe = makeZoe({ require });
  const inviteIssuer = zoe.getInviteIssuer();

  const timerService = buildManualTimer(console.log);
 
  const contractReadyP = bundleSource(contractRoot).then(
    ({ source, moduleFormat }) => {
      const installationHandle = zoe.install(source, moduleFormat);

      return zoe
        .makeInstance(installationHandle, {}, { timerService })
        .then(myInvite => {
          return inviteIssuer
            .getAmountOf(myInvite)
            .then(({ extent: [{ instanceHandle: auditoriumHandle }] }) => {
              const { publicAPI } = zoe.getInstanceRecord(auditoriumHandle);

              return (
                zoe
                  .offer(myInvite, harden({}))
                  // cancel will be renamed complete: https://github.com/Agoric/agoric-sdk/issues/835
                  // cancelObj exists because of a current limitation in @agoric/marshal : https://github.com/Agoric/agoric-sdk/issues/818
                  .then(
                    async ({
                      outcome: outcomeP,
                      payout,
                      cancelObj: { cancel: complete },
                      offerHandle,
                    }) => {
                      return {
                        publicAPI,
                        operaPayout: payout,
                        complete,
                      };
                    },
                  )
              );
            });
        });
    },
  )

  contractReadyP.then(({ publicAPI }) => {
    const currencyIssuer = produceIssuer('BaytownBucks')
    const { mint: baytownBucksMint, issuer } = currencyIssuer;
    const baytownBucks = issuer.getAmountMath().make;

    const housesIssuerMain = produceIssuer('Houses')
    const { mint: housesMint, issuer: housesIssuer } = housesIssuerMain;
    const houses = housesIssuer.getAmountMath().make;

    const pledge = housesMint.mintPayment(houses(1));
    const ransomAmount = 1000;

    async function sendPledge(date) {
      let receiverPayment;
      const receiver = {
        receivePayment(payment){
            receiverPayment = payment;
        }
      }

      const sendInvite = inviteIssuer.claim(publicAPI.makeSendPledgeInvite(
        harden(receiver), harden(pledge), harden(issuer), harden(ransomAmount), harden(date)
      )());
      const aliceProposal = {};
      return zoe
        .offer(sendInvite, harden(aliceProposal), {})
        .then(
          async ({
            outcome: outcomeP,
            payout,
            cancelObj: { cancel: complete },
            offerHandle,
          }) => {
            const amount = await E(publicAPI.issuer).getAmountOf((await payout).Wrapper);

            return {
              publicAPI,
              operaPayout: payout,
              complete,
            };
          },
        )
    }

    async function pushPullMoney(date, positive) {
      sendPledge(date)
        // .then(() => {
        //   const receiveInvite = inviteIssuer.claim(publicAPI.makeReceiveInvite(handle)());
        //   const bobProposal = {}
        //   return zoe
        //     .offer(receiveInvite, harden(bobProposal), {})
        //     .then(
        //       async ({
        //         outcome: outcomeP,
        //         payout,
        //         cancelObj: { cancel: complete },
        //         offerHandle,
        //       }) => {
        //         const wrapperPayment = await (await payout).Wrapper;
        //         const amount = await E(publicAPI.issuer).getAmountOf(wrapperPayment);
        //         const payment = await E(publicAPI.issuer).getAmountOf(amount.extent[0][0]);
        //         const timeRelease = payment.extent[0][0];
        //         const realPayment = await timeRelease.getPayment()
        //         if(!positive) {
        //           t.equal(realPayment, null, `There is no payment yet.`)
        //         } else {
        //           t.equal((await issuer.getAmountOf(realPayment)).extent, 1000, `correct payment amount`)
        
        //           return {
        //             publicAPI,
        //             operaPayout: payout,
        //             complete,
        //           };
        //         }
        //       }
        //     )
        // })
        .then(() => {
          return { publicAPI };
        });
    }

    return pushPullMoney(1, false)
      // .then((x) => {
      //   E(timerService).tick("Going to the future");
      //   return pushPullMoney(1, true);
      // });
  })
  .catch(err => {
    console.error('Error in last Time Release part', err);
    t.fail('  error');
  })
  .then(() => t.end());
});