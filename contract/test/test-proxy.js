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
      console.log("X1");
      const installationHandle = zoe.install(source, moduleFormat);

      return zoe
        .makeInstance(installationHandle, {}, { timerService })
        .then(myInvite => {
          console.log("X2");
          return inviteIssuer
            .getAmountOf(myInvite)
            .then(({ extent: [{ instanceHandle: auditoriumHandle }] }) => {
              console.log("X3");
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
                      console.log("X4");
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
    console.log("X5");
    const currencyIssuer = produceIssuer('BaytownBucks')
    const { mint: baytownBucksMint, issuer } = currencyIssuer;
    const baytownBucks = issuer.getAmountMath().make;

    const housesIssuerMain = produceIssuer('Houses')
    const { mint: housesMint, issuer: housesIssuer } = housesIssuerMain;
    const houses = housesIssuer.getAmountMath().make;

    const pledge = housesMint.mintPayment(houses(1));
    const ransomAmount = 1000;

    class MyTester {
      constructor() {
        this.receiverPayment = null;
      }

      async sendPledge(date) {
        let that = this;
        const receiver = {
          receivePayment(payment){
            that.receiverPayment = payment;
          }
        }

        const sendPledgeInvite = inviteIssuer.claim(publicAPI.makeSendPledgeInvite(
          harden(receiver), harden(pledge), harden(issuer), harden(ransomAmount), harden(date))());
        const aliceProposal = {};
        return zoe
          .offer(sendPledgeInvite, harden(aliceProposal), {})
          .then(
            async ({
              payout,
            }) => {
              console.log("X6");
              const amount = await E(publicAPI.issuer).getAmountOf((await payout).Wrapper); // wait for payout to complete

              return {
                publicAPI,
              };
            },
          )
      }

      async receivePledge({publicAPI}) {
        console.log("X8");
        const receiverAmount = await E(publicAPI.issuer).getAmountOf(this.receiverPayment);
        const handle = receiverAmount.extent[0][0];

        const receivePledgeInvite = inviteIssuer.claim(publicAPI.makeReceivePledgeInvite(harden(handle))());
        const bobProposal = {};
        return zoe
          .offer(receivePledgeInvite, harden(bobProposal), {})
          .then(
            async ({
              outcome: outcomeP,
              payout,
              cancelObj: { cancel: complete },
              offerHandle,
            }) => {
              console.log("X7");
              const amount = await E(publicAPI.issuer).getAmountOf((await payout).Wrapper);
              // const pledge = amount.extent[0][0];

              return {
                publicAPI,
                // pledge,
              };
            },
          )
      }
    }

    async function pushPullMoney(date, positive) {
      let myTester = new MyTester();

      return myTester.sendPledge(date)
        .then(async ({publicAPI}) => await myTester.receivePledge({publicAPI}))
        // .then(({publicAPI, pledge}) => {
        //   t.equal(pledge, null, `pledge too early to return.`)
        // })
        // .then(() => {
        //   E(timerService).tick("Going to the future");
        // })
        // .then(myTester.receivePledge)
        // .then(({publicAPI, pledge}) => {
        //   console.log("pledge", pledge);
        // })
        // .then(() => {
        //   return { publicAPI };
        // });
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