-- Migration: Regrade all past submissions to fix all-MC 10-point scale and Structure C weighting
DO $$
DECLARE
    sub_rec RECORD;
    ans_rec RECORD;
    mc_count INT;
    tf_count INT;
    sa_count INT;
    total_questions INT;
    is_all_mc BOOLEAN;
    is_structure_b BOOLEAN;
    is_structure_c BOOLEAN;
    
    -- variables for scoring
    v_correct_count INT;
    v_wrong_count INT;
    v_total_score NUMERIC;
    
    -- variables for TF statement checking
    given_val JSONB;
    correct_val JSONB;
    correct_tf_count INT;
    
    -- variables for SA checking
    given_str TEXT;
    expected_str TEXT;
    is_sa_correct BOOLEAN;
    
    -- question-level correct flag
    is_q_correct BOOLEAN;
    q_score NUMERIC;
BEGIN
    FOR sub_rec IN SELECT id, homework_id FROM public.submissions LOOP
        -- 1. Count question types for this homework
        SELECT 
            count(*) FILTER (WHERE q.question_type = 'MULTIPLE_CHOICE'),
            count(*) FILTER (WHERE q.question_type = 'TRUE_FALSE'),
            count(*) FILTER (WHERE q.question_type = 'SHORT_ANSWER'),
            count(*)
        INTO mc_count, tf_count, sa_count, total_questions
        FROM public.questions q
        WHERE q.homework_id = sub_rec.homework_id;
        
        is_all_mc := (mc_count = total_questions AND total_questions > 0);
        is_structure_b := (mc_count = 12 AND tf_count = 4 AND sa_count = 6);
        is_structure_c := (mc_count = 18 AND tf_count = 4 AND sa_count = 6);
        
        -- If it matches any of our custom grading structures, recalculate scores
        IF is_all_mc OR is_structure_b OR is_structure_c THEN
            v_correct_count := 0;
            v_wrong_count := 0;
            v_total_score := 0;
            
            -- Loop through each answer for this submission
            FOR ans_rec IN 
                SELECT sa.id, sa.given_answer, q.question_type, qa.mc_answer, qa.tf_answers, qa.sa_answer, qa.sa_tolerance
                FROM public.submission_answers sa
                JOIN public.questions q ON q.id = sa.question_id
                LEFT JOIN public.question_answers qa ON qa.question_id = q.id
                WHERE sa.submission_id = sub_rec.id
            LOOP
                is_q_correct := false;
                q_score := 0;
                
                IF ans_rec.question_type = 'MULTIPLE_CHOICE' THEN
                    IF ans_rec.given_answer->>'value' IS NOT NULL AND ans_rec.mc_answer IS NOT NULL THEN
                        IF trim(upper(ans_rec.given_answer->>'value')) = trim(upper(ans_rec.mc_answer)) THEN
                            is_q_correct := true;
                            IF is_all_mc THEN
                                q_score := round(10.0 / total_questions::numeric, 2);
                            ELSIF is_structure_b THEN
                                q_score := 0.25;
                            ELSIF is_structure_c THEN
                                q_score := 0.25;
                            END IF;
                        END IF;
                    END IF;
                    
                ELSIF ans_rec.question_type = 'TRUE_FALSE' THEN
                    given_val := ans_rec.given_answer->'value';
                    correct_val := ans_rec.tf_answers;
                    correct_tf_count := 0;
                    
                    IF given_val IS NOT NULL AND correct_val IS NOT NULL THEN
                        -- Check Statement A/S1
                        IF (coalesce(given_val->>'a', given_val->>'s1'))::boolean = (coalesce(correct_val->>'a', correct_val->>'s1'))::boolean THEN
                            correct_tf_count := correct_tf_count + 1;
                        END IF;
                        -- Check Statement B/S2
                        IF (coalesce(given_val->>'b', given_val->>'s2'))::boolean = (coalesce(correct_val->>'b', correct_val->>'s2'))::boolean THEN
                            correct_tf_count := correct_tf_count + 1;
                        END IF;
                        -- Check Statement C/S3
                        IF (coalesce(given_val->>'c', given_val->>'s3'))::boolean = (coalesce(correct_val->>'c', correct_val->>'s3'))::boolean THEN
                            correct_tf_count := correct_tf_count + 1;
                        END IF;
                        -- Check Statement D/S4
                        IF (coalesce(given_val->>'d', given_val->>'s4'))::boolean = (coalesce(correct_val->>'d', correct_val->>'s4'))::boolean THEN
                            correct_tf_count := correct_tf_count + 1;
                        END IF;
                    END IF;
                    
                    is_q_correct := (correct_tf_count = 4);
                    
                    IF is_structure_b OR is_structure_c THEN
                        IF correct_tf_count = 1 THEN q_score := 0.1;
                        ELSIF correct_tf_count = 2 THEN q_score := 0.25;
                        ELSIF correct_tf_count = 3 THEN q_score := 0.5;
                        ELSIF correct_tf_count = 4 THEN q_score := 1.0;
                        END IF;
                    END IF;
                    
                ELSIF ans_rec.question_type = 'SHORT_ANSWER' THEN
                    is_sa_correct := false;
                    IF ans_rec.given_answer->>'value' IS NOT NULL AND ans_rec.sa_answer IS NOT NULL THEN
                        given_str := trim(lower(ans_rec.given_answer->>'value'));
                        expected_str := trim(lower(ans_rec.sa_answer));
                        
                        IF given_str = expected_str AND length(expected_str) > 0 THEN
                            is_sa_correct := true;
                        ELSE
                            BEGIN
                                IF abs(given_str::numeric - expected_str::numeric) <= coalesce(ans_rec.sa_tolerance, 0) THEN
                                    is_sa_correct := true;
                                END IF;
                            EXCEPTION WHEN OTHERS THEN
                                is_sa_correct := false;
                            END;
                        END IF;
                    END IF;
                    
                    is_q_correct := is_sa_correct;
                    IF is_sa_correct THEN
                        IF is_structure_b THEN q_score := 0.5;
                        ELSIF is_structure_c THEN q_score := 0.25;
                        END IF;
                    END IF;
                END IF;
                
                -- Update individual answer score and correctness
                UPDATE public.submission_answers 
                SET is_correct = is_q_correct, score_earned = q_score
                WHERE id = ans_rec.id;
                
                IF is_q_correct THEN
                    v_correct_count := v_correct_count + 1;
                ELSE
                    v_wrong_count := v_wrong_count + 1;
                END IF;
                v_total_score := v_total_score + q_score;
            END LOOP;
            
            -- Round total score
            IF is_all_mc THEN
                v_total_score := round((v_correct_count::numeric / total_questions::numeric) * 10.0, 1);
            ELSE
                v_total_score := round(v_total_score, 2);
            END IF;
            
            -- Update submission totals
            UPDATE public.submissions 
            SET total_score = v_total_score, correct_count = v_correct_count, wrong_count = v_wrong_count
            WHERE id = sub_rec.id;
        END IF;
    END LOOP;
END $$;
