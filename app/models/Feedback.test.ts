import {Feedback, FeedbackAttributes, FeedbackInstance} from './Feedback'
import {Quest, QuestAttributes, QuestInstance} from './Quests'
import * as Sequelize from 'sequelize'
import * as expect from 'expect'
import * as sinon from 'sinon'

describe('feedback', () => {
  let f: Feedback;
  let q: Quest;

  const testRatingData: FeedbackAttributes = {
    created: new Date(),
    partition: "testpartition",
    questid: "questid",
    userid: "userid",
    questversion: 1,
    rating: 4.0,
    text: "This is a rating!",
    email: "test@test.com",
    name: "Test Testerson",
    difficulty: "normal",
    platform: "ios",
    players: 5,
    version: "1.0.0",
  };

  describe('submitFeedback', () => {
    it('TODO write tests');
  });

  describe('submitReportError', () => {
    it('TODO write tests');
  });

  describe('submitReportQuest', () => {
    it('TODO write tests');
  });

  describe('submitRating', () => {
    beforeEach((done: () => any) => {
      const s = new Sequelize({dialect: 'sqlite', storage: ':memory:'});
      q = new Quest(s);
      q.model.sync()
        .then(() => {
          return q.model.create({partition: 'testpartition', id: 'questid', ratingavg: 0, ratingcount: 0, email: 'author@test.com'});
        })
        .then(() => {
          f = new Feedback(s);
          f.associate({Quest: q});
          q.associate({Feedback: f});
          f.model.sync()
            .then(() => {done();})
            .catch((e: Error) => {throw e;});
        })
        .catch((e: Error) => {throw e;});
    });

    it('fails to store feedback if no such quest exists', (done: ()=>any) => {
      const rating = {...testRatingData, questid: "nonexistantquest"};

      f.submitRating(rating)
        .catch((e: Error) => {
          expect(e.message.toLowerCase()).toContain("no such quest");
          done();
        });
    });

    it('succeeds if performed on an existing quest', (done: ()=>any) => {
      f.submitRating(testRatingData)
        .then(() => {
          return f.get("testpartition", "questid", "userid");
        })
        .then((result: FeedbackInstance) => {
          expect(result.dataValues).toEqual(testRatingData);
          done();
        });
    });

    it('succeeds if a rating was already given for the quest', (done: () => any) => {
      const rating2 = {...testRatingData, rating: 5.0};

      f.submitRating(testRatingData)
        .then(() => {
          return f.submitRating(rating2);
        })
        .then(() => {
          return f.get("testpartition", "questid", "userid");
        })
        .then((result: FeedbackInstance) => {
          expect(result.dataValues).toEqual(rating2);
          return q.get("testpartition", "questid");
        })
        .then((quest: QuestInstance) => {
          expect(quest.dataValues.ratingcount).toEqual(1);
          expect(quest.dataValues.ratingavg).toEqual(5);
          done();
        });
    });

    it('re-calculates quest rating avg and count on new feedback (only counting feedback with defined ratings)', (done: () => any) => {
      const rating1 = {...testRatingData, rating: 3.0, userid: "1"};
      const rating2 = {...testRatingData, rating: 4.0, userid: "2"};
      const rating3 = {...testRatingData, rating: 1.0, userid: "3"};
      const ratingNull = {...testRatingData, rating: null, userid: "4"};
      f.submitRating(rating1)
        .then(() => {return f.submitRating(rating2);})
        .then(() => {return f.submitRating(rating3);})
        .then(() => {return f.submitRating(ratingNull);})
        .then(() => {
          return q.get("testpartition", "questid");
        })
        .then((quest: QuestInstance) => {
          expect(quest.dataValues.ratingcount).toEqual(3); // Null is not counted
          if (!quest.dataValues.ratingavg) {
            throw Error('Undefined average rating');
          }
          expect(quest.dataValues.ratingavg.toFixed(2)).toEqual(2.67);
          done();
        });
    });
  });
});
